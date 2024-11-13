require("dotenv").config();

const puppeteer = require("puppeteer");
const {google} = require("googleapis");
const express = require("express");
const app = express();
const port = 3000;
const fs = require("fs");
const readline = require('readline-sync');

// const CREDENTIALS_PATH = "./client_secret_698572200061-4avklm4m1aplbqmrsn7bbjqcpo7pa85e.apps.googleusercontent.com.json";
// const TOKEN_PATH = "./token.json";
// const API_KEY = process.env.API_KEY;
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

// const authorize = async () => {
    // const oauth2Client = new google.auth.OAuth2(
    //     process.env.CLIENT_ID,
    //     process.env.CLIENT_SECRET,
    //     // "http://localhost:3000"
    // );

    // if (fs.existsSync(TOKEN_PATH)) {
    //     const token = fs.readFileSync(TOKEN_PATH);
    //     oauth2Client.setCredentials(JSON.parse(token));
    // } else {
    //     // Nếu chưa có mã thông báo, yêu cầu người dùng xác thực
    //     const authUrl = oauth2Client.generateAuthUrl({
    //         access_type: 'offline',
    //         scope: SCOPES,
    //     });
    //     console.log("Authorize this app by visiting this URL:", authUrl);

    //     // Sau khi người dùng nhập mã xác thực, lưu mã này vào token.json
    //     const code = await askUserForCode();
    //     const { tokens } = await oauth2Client.getToken(code);
    //     oauth2Client.setCredentials(tokens);
    //     fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    // }
    // return oauth2Client;


// };

// const askUserForCode = () => {
//     return new Promise((resolve) => {
//         const readline = require("readline").createInterface({
//             input: process.stdin,
//             output: process.stdout,
//         });
//         readline.question("Enter the code from that page here: ", (code) => {
//             readline.close();
//             resolve(code);
//         });
//     });
// };

app.get("/", (req, res) => {
    const filePath = "./test-data.json";

    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.error(err);
            res.status(500).send("Internal Server Error");
            return;
        } 

        res.json(JSON.parse(data));
    });
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});

const oauth2Client = new google.auth.OAuth2(process.env.CLIENT_ID, process.env.CLIENT_SECRET, "http://localhost");

const sheets= google.sheets({version: 'v4', auth: oauth2Client});

const authenticate = async () => {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    })

    console.log("Authorize this app by visiting this url", authUrl);
    const code = readline.question("Enter the code from that page here: ");
    const {tokens} = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    console.log("Susscessfully authenticated client");
}

const getGoogleSheetData = async () => {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `!A1:C10`,
    })
    console.log(res.data.values);
    
}

const scrapeData = async (url) => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(url);

    const allProduct = await page.evaluate(()=>{
        const products = document.querySelectorAll(".pc-custom-link.jfy-item.hp-mod-card-hover")
        return Array.from(products).map((product, index)=>{
            const title = product.querySelector('.card-jfy-title.two-line-clamp').innerText;
            const imageElement = product.querySelector('.common-img.jfy-item-image img');
            const image = imageElement ? imageElement.getAttribute('src') : 'No image';
            const price = product.querySelector('.price').innerText;
            return {index, title, image, price};
        })
    
    })

    // fs.writeFileSync('lazada.json', JSON.stringify(allProduct, null, 2));
    
    browser.close();

    return allProduct;
}

const updateGoogleSheet = async (allProduct) => {
    const dataToUpdate = allProduct.map((product)=>[product.index, product.title, product.image, product.price]);

    await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `!A1`,
        valueInputOption: "RAW",
        resource: {
            values: [
                ["index", "title", "image", "price"],
                ...dataToUpdate
            ]
        }
    })

    console.log("Data updated successfully");
    
}

(async () => {
    await authenticate();
     const url = "https://www.lazada.vn/?spm=a211g0.flashsale.header.dhome.768f8yvV8yvVDx#?";
     const data = await scrapeData(url);
     await updateGoogleSheet(data);
    // getGoogleSheetData();
})();