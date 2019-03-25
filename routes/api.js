/*
*
*
*       Complete the API routing below
*
*
*/

'use strict';

var expect = require('chai').expect;
var MongoClient = require('mongodb');

const mongoose  = require('mongoose');
require('dotenv').config(); 

const request   = require('request');

const CONNECTION_STRING = process.env.DB; //MongoClient.connect(CONNECTION_STRING, function(err, db) {});
mongoose.connect(CONNECTION_STRING);

module.exports = function (app) {
  
  var stockSchema = new mongoose.Schema({
      stock: String,
      IP: [String],
      likes: Number
  })

  var Stock = mongoose.model('Stock', stockSchema);
  
  let getApiData = (stock) => {
    let URL = 'https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol='
        + stock + '&apikey=' + process.env.ALPHA_API_KEY;
    let stockObj = {};
    return new Promise((resolve, reject) => {
        request(URL, { json: true }, (err, res, body) => {
            if (err) { return console.log(err) };
            stockObj.stock = body['Global Quote']['01. symbol'];
            stockObj.price = body['Global Quote']['05. price'];
            resolve(stockObj);
        })
    })
  }
    
  
  let initializeStockObjects = async (req, res, next) => {
      res.locals.obj1 = {};
      res.locals.obj2 = {};
      try {
          res.locals.obj1 = await getApiData(req.query.stock1);
      } catch (err) {
          console.log(err);
      }
      if (req.query.stock2) {
          console.log('two stocks - first stock is: ' + req.query.stock1);
          console.log("two stocks - second stock is: " + req.query.stock2);
          try {
              res.locals.obj2 = await getApiData(req.query.stock2);
          } catch (err) {
              console.log(err);
          }
      }
      next();
  }

  
  function handleLikeRequest(stock, IP) {
      return new Promise((resolve, reject) => {
          Stock.findOne({ stock: stock }, (err, result) => {
              if (err) {
                  console.log(err);
                  resolve(); // Change to reject()? 
              }
              //If no stock is found in DB, then assume no IP's have liked it
              if (!result) {
                  let newStock = new Stock({
                      stock: stock,
                      IP: IP,
                      likes: 1
                  })
                  newStock.save((err, stock) => {
                      if (err) { console.log(err) }
                      console.log('new stock saved');
                      resolve(1); //New stock with 1 like; change this to stock.likes of new doc
                  })
              }
              //If stock is found and it includes IP, then a new like should not be added
              else if (result.IP.includes(IP)) {
                  console.log('already liked from this IP');
                  resolve(result.likes); //Existing likes value of stock; not updated
              }
              //Else assume stock is found and no matching IP existed. Update and return likes value.
              else {
                  Stock.update({ stock: stock },
                      {
                          $inc: { likes: 1 },
                          $push: { IP: IP }
                      },
                      (err, newResult) => {
                          if (err) { console.log(err) };
                          console.log('existing stock updated');
                          resolve(newResult.likes); //Updated likes
                      }
                  )
              }
          })
      })
  }  
  

  function getLikes(stock) {
      return new Promise((resolve, reject) => { 
          Stock.findOne({ stock: stock }, (err, result) => {
              if (err) {
                  console.log(err);
                  resolve();
              }
              if (result) { resolve(result.likes) }
              resolve(0); //No result assumes 0 likes
          })
      })
  }
  

  let appendLikes = async (req, res, next) => {
    if (!req.query.like && !req.query.stock2) {
        res.locals.obj1.likes = await getLikes(req.query.stock1);
    } else if (req.query.like && !req.query.stock2) {
        res.locals.obj1.likes = await handleLikeRequest(req.query.stock1, req.ip);
    } else if (!req.query.like && req.query.stock2) {
        res.locals.obj1.likes = await getLikes(req.query.stock1);
        res.locals.obj2.likes = await getLikes(req.query.stock2);
    } else if (req.query.like && req.query.stock2) {
        res.locals.obj1.likes = await handleLikeRequest(req.query.stock1, req.ip);
        res.locals.obj2.likes = await handleLikeRequest(req.query.stock2, req.ip);
    }
    next();
  }

      
  app.route('/api/stock-prices')
    .get(initializeStockObjects, appendLikes, (req, res) => {
        var result = {};
        if (req.query.stock2) {
            result.stockData = [
                {
                    stock: res.locals.obj1.stock,
                    price: res.locals.obj1.price,
                    rel_likes: res.locals.obj1.likes - res.locals.obj2.likes
                },
                {
                    stock: res.locals.obj2.stock,
                    price: res.locals.obj2.price,
                    rel_likes: res.locals.obj2.likes - res.locals.obj1.likes
                }]
        }
        else { result.stockData = res.locals.obj1 };
        res.json(result);
    });
    
};
