var express = require('express');
var fs = require("fs"), json;
var bodyParser = require('body-parser');
var moment = require('moment');
require('dotenv').config()
var app = express();

const mongo = require('mongodb').MongoClient;
const assert = require('assert');

const mongo_url = 'mongodb://localhost:27017';
const db_name = 'fifa';
const password = process.env.PASSWORD;
let matches_json = getJSON('match-data.json');

app.use(bodyParser.json({limit: '20mb'}));
app.use(bodyParser.urlencoded({ limit: '20mb', extended: true }));

app.get('/', (req, res) => {
  res.send('Pulpo Bot v1.0');
});

app.get('/update-data', async (req, res) => {
  if(req.query.pass && req.query.pass == password) {
    try {
      let matches = await findMatches({});
      if(matches && matches.length) {
        console.log('Not created.');
        return res.json(matches);
      } else {
        let created_matches = await createMatches(matches_json.matches);
        return res.json(created_matches);
      }
    } catch (e) {
      return res.status(500).json({error: e});
    }
  } else return res.json({error: 'No password.'});
});

app.post('/find', async (req, res) => {
  console.log(req.body);
  if(req.body.pass && req.body.pass == password) {
    //parse today and set current date
    if(req.body.query && req.body.query.date) {
      if(req.body.query.date == 'TODAY')
        req.body.query.date = moment().format("YYYYMMDD");
    }

    try {
      let matches = await findMatches(req.body.query || {}, req.body.limit || 0, req.body.sort || {});
      return res.json(matches);
    } catch (e) {
      return res.status(500).json({error: e});
    }
  } else return res.json({error: 'No password.'})
});

mongo.connect(mongo_url, function(err, client) {
  assert.equal(null, err);
  console.log("Connected successfully to mongo!");
  const db = client.db(db_name);
  client.close();
});

app.listen(3000, function () {});

//CREATE MATCHES ON THE DB
let createMatches = items => {
  return new Promise ((resolve, reject) => {
    mongo.connect(mongo_url, function (err, db) {
      if(err) return resolve(null);
      var dbase = db.db(db_name);
      dbase.collection('match').insert(items, function (err, res) {
        db.close();
        if(err || !res) return resolve(null);
        if(res.result && res.result.ok)
          return resolve(res.ops);
        else return resolve(null);
      });
    });
  });
};

let findMatches = (query, limit, sort) => {
  return new Promise ((resolve, reject) => {
    mongo.connect(mongo_url, function (err, db) {
      if(err) return resolve(null);
      var dbase = db.db(db_name);
      dbase.collection('match').find(query || {})
      .limit(limit || 0)
      .sort(sort || {})
      .toArray(function (err, res) {
        db.close();
        if(err || !res) return resolve(null);
        else {
          return resolve(res);
        }
      });
    });
  });
};

function readJsonFileSync(filepath, encoding){
  if (typeof (encoding) == 'undefined'){
    encoding = 'utf8';
  }
  var file = fs.readFileSync(filepath, encoding);
  return JSON.parse(file);
}

function getJSON(file){
  var filepath = __dirname + '/resources/' + file;
  return readJsonFileSync(filepath);
}
