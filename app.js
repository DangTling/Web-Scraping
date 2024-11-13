require("dotenv").config();

const { google } = require("googleapis");
const express = require("express");
const app = express();
const port = 3000;
const cookieParser = require("cookie-parser");
const open = require("opn");
const { default: axios } = require("axios");
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

app.use(cookieParser());

const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  "http://localhost:3000/oauth2callback"
);

const sheets = google.sheets({ version: "v4", auth: oauth2Client });

const scrapeData = async (url) => {
  try {
    const res = await axios.get(url);
    if (res.data.ERR_MSG === "Success") {
      return res.data.RESULT.slice(1);
    } else {
      console.log("Call API error");
      return null;
    }
  } catch (error) {
    console.log(error);
  }
};

const getRangeBasedOnType = (type) => {
  switch (type) {
    case "kho-clip":
      return "!C3:D13";
    case "camnangyte":
      return "!E3:F23";
    default:
      return "!A3:B23";
  }
};

const formatCurrentDateTime = (type) => {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  if (type === "param") {
    return `${year}${month}${day}`;
  }
  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

const updateGoogleSheet = async (allProduct, type) => {
  const range = getRangeBasedOnType(type);
  const currentDateTime = formatCurrentDateTime("data");
  const dataToUpdate = allProduct.map((product) => [
    product.TenDoiTac,
    product.TongDangKy,
  ]);

  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: range,
    valueInputOption: "RAW",
    resource: {
      values: [...dataToUpdate],
    },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `!J1`,
    valueInputOption: "RAW",
    resource: {
      values: [[currentDateTime]],
    },
  });

  console.log("Data updated successfully");
};

const refreshAccessToken = async (req, res) => {
  try {
    const refresh_token = req.cookies.refresh_token;
    if (!refresh_token) {
      console.log("Refresh token not found");
      return false;
    }

    oauth2Client.setCredentials({ refresh_token });

    const { token } = await oauth2Client.getAccessToken();
    if (token) {
      res.cookie("access_token", token, { httpOnly: true, secure: true });
      oauth2Client.setCredentials({ access_token: token });
      console.log("Access token refreshed successfully");
      return true;
    }
  } catch (error) {
    console.log("Error refreshing access token:", error);
    return false;
  }
  return false;
};

app.get("/oauth2callback", async (req, res) => {
  let access_token = req.cookies ? req.cookies.access_token : null;
  if (!access_token) {
    const tokenRefreshed = await refreshAccessToken(req, res);
    if (!tokenRefreshed) {
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES,
      });

      console.log("Authorize this app by visiting this url", authUrl);
      open(authUrl);
      if (!req.query.code) {
        return res.status(400).send("Error: Authorization code not found");
      }
      const { tokens } = await oauth2Client.getToken(req.query.code);
      oauth2Client.setCredentials(tokens);
      console.log("Susscessfully authenticated client");
      res.cookie("access_token", tokens.access_token, {
        httpOnly: true,
        secure: true,
      });
      res.cookie("refresh_token", tokens.refresh_token, {
        httpOnly: true,
        secure: true,
      });
    }
  } else {
    oauth2Client.setCredentials({ access_token });
  }

  const authenticate = async (maDoiTac, maTruyenThong, type, url) => {
    try {
      const timeParam = formatCurrentDateTime("param");
      const data = await scrapeData(
        `http://${url}/service1.svc/BaoCaoDoanhThuRealtime?cmdCode=BaoCaoDoanhThuRealtime&MaDoiTac=${maDoiTac}&MaTruyenThong=${maTruyenThong}&MaGoiCuoc=0&GiaCuoc=0&fromdate=${timeParam}&todate=${timeParam}&IsGroupDoiTac=1`
      );
      await updateGoogleSheet(data, type);

      const intervalId = setInterval(async () => {
        const data = await scrapeData(
          `http://${url}/service1.svc/BaoCaoDoanhThuRealtime?cmdCode=BaoCaoDoanhThuRealtime&MaDoiTac=${maDoiTac}&MaTruyenThong=${maTruyenThong}&MaGoiCuoc=0&GiaCuoc=0&fromdate=20241112&todate=20241112&IsGroupDoiTac=1`
        );
        if (!data) {
          console.log("Call API failed. Stopping the loop.");
          clearInterval(intervalId);
          return;
        }
        await updateGoogleSheet(data, type);
      }, 300000);
    } catch (error) {
      console.error(error);
      res.status(500).send("Internal Server Error");
    }
  };
  await authenticate("84", 80, "vishare", "pttt.vishare.vn");
  await authenticate("187", 0, "kho-clip", "pttt.kho-clip.com");
  await authenticate("67,68", 0, "camnangyte", "pttt.camnangyte.vn");

  await res.redirect(
    "https://docs.google.com/spreadsheets/d/1v9-Y0TyZuh0TRAZtCFccPR6oLcbpap4DOWYp-hruu4U/edit?gid=0#gid=0"
  );
});
app.listen(port, async () => {
  console.log(`Demo app is listening on port ${port}`);

  try {
    await axios.get(`http://localhost:${port}/oauth2callback`);
  } catch (error) {
    console.log("Error during call to oauth2 callback api: ", error);
  }
});

