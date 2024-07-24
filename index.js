const AWS = require('aws-sdk');
AWS.config.update({
  region: 'us-east-1'
});
const ses = new AWS.SES();
const s3 = new AWS.S3();
const yf = require('yahoo-finance');
const moment = require('moment-timezone');
const stockList = ['ANET', 'CSCO', 'NVDA', 'BA'];
const maxDipPercent = 10.0;
const todayDate = moment().tz('America/New_York').format('YYYY-MM-DD');
const tomorrowDate = moment().tz('America/New_York').add(1, 'days').format('YYYY-MM-DD');

const emailSender = 'a44deng@uwaterloo.ca';
const emailRecipients = ['a44deng@uwaterloo.ca'];
const s3BucketName = 'stock-price-log-bucket428';

exports.handler = async () => {
    const stockChangeList = await retrieveStockDipList();
    if (stockChangeList.length > 0) {
        await sendEmail(stockChangeList);
        await saveToS3('stock-data', `${todayDate}.json`, stockChangeList);
    }
};

// Retrieves stock prices from Yahoo Finance API and determines change in price (%)
async function retrieveStockDipList() {
    const stockInfoList = [];
    for (const stock of stockList) {
        const priceHistory = await yf.historical({ symbol: stock, from: todayDate, to: tomorrowDate });
        const stockSummary = await yf.quote({ symbol: stock, modules: ['summaryDetail'] });
        const currentPrice = priceHistory[0].adjClose;
        const allTimeHigh = stockSummary.summaryDetail.fiftyTwoWeekHigh;
        const percentDip = Math.abs(currentPrice - allTimeHigh) / allTimeHigh * 100;
        if (percentDip > maxDipPercent) {
            stockInfoList.push({
                ticker: stock,
                currentPrice: currentPrice,
                allTimeHigh: allTimeHigh,
                percentDip: percentDip
            });
        }
    }
    return stockInfoList;
}

// Function to send email to verified email addresses
async function sendEmail(stockDipList) {
    const emailContent = `Below are the stocks that changed more than ${maxDipPercent}% from their 52-week high: \n\n${JSON.stringify(stockDipList)} \n\n-from my lambda`;
    const params = {
        Source: emailSender,
        Destination: {
            ToAddresses: emailRecipients
        },
        Message: {
            Subject: {
                Charset: 'UTF-8',
                Data: `Stocks changed more than ${maxDipPercent}% detected on ${todayDate}`
            },
            Body: {
                Text: {
                    Charset: 'UTF-8',
                    Data: emailContent
                }
            }
        }
    };
    await ses.sendEmail(params).promise().then(response => {
        console.log(`Email sent: ${response}`);
    }, error => {
        console.error('Error while sending email: ', error);
    });

    // Archive the email content to S3
    await saveToS3('emails', `${todayDate}.txt`, emailContent);
}

// Function to save data to S3
async function saveToS3(folder, fileName, data) {
    const params = {
        Bucket: s3BucketName,
        Key: `${folder}/${fileName}`,
        Body: JSON.stringify(data),
        ContentType: 'application/json'
    };
    return s3.putObject(params).promise();
}
