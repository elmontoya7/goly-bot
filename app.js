var express = require('express');
var fs = require("fs"), json;
var bodyParser = require('body-parser');
var moment = require('moment');
require('dotenv').config()
var app = express();

app.use(express.static('public'));

const mongo = require('mongodb').MongoClient;
const assert = require('assert');

const mongo_url = 'mongodb://localhost:27017';
const db_name = 'fifa';
const password = process.env.PASSWORD;
let matches_json = getJSON('match-data.json');
let new_matches_json = getJSON('new-matches.json');

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
        let promises = [];
        for(match of new_matches_json.matches) {
          promises.push(
            updateMatch(
              {
                team_home: match.team_home,
                team_away: match.team_away,
                date: match.date
              },
              {
                $set: {
                  score: match.score,
                  score_home: match.score_home,
                  score_away: match.score_away,
                  status: match.status,
                  match: match.match,
                  image: match.image
                }
              }
            )
          );
        }

        Promise.all(promises).then(results => {
          console.log('All updated!');
          return res.json(results);
        }, err => {
          console.log(err);
          return res.json({error: err});
        });
      } else {
        let created_matches = await createMatches(matches_json.matches);
        return res.json(created_matches);
      }
    } catch (e) {
      return res.status(500).json({error: e});
    }
  } else return res.json({error: 'No password.'});
});

app.post('/update', async (req, res) => {
  if(req.body.pass && req.body.pass == password) {
    let match = req.body.update;
    try {
      let update = await updateMatch(
        {
          team_home: match.team_home,
          team_away: match.team_away,
          date: match.date
        },
        {
          $set: {
            score: match.score,
            score_home: match.score_home,
            score_away: match.score_away,
            status: match.status
          }
        }
      );
      return res.json(update);
    } catch (e) {
      console.log(e);
      return res.json({error: e});
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
      for(match of matches) {
        match.in_about = '';
        if(match.status == 'Pendiente') {
          let time = moment(match.date + ' ' + match.time, 'YYYYMMDD HH:mm');
          let now = moment();
          if(time.isValid()) {
            match.in_about = 'en ' + moment.duration(time.diff(now)).locale('es').humanize();
          } else {
            match.in_about = '';
          }
        }
      }
      return res.json({matches: matches});
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

let updateMatch = (item, newData) => {
  return new Promise ((resolve, reject) => {
    mongo.connect(mongo_url, function (err, db) {
      if(err) return resolve(null);
      var dbase = db.db(db_name);
      dbase.collection('match').updateOne(item, newData, function (err, res) {
        db.close();
        if(err || !res) return resolve(null);
        return resolve(res);
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
