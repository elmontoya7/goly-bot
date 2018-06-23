var express = require('express');
var fs = require("fs"), json;
var bodyParser = require('body-parser');
var moment = require('moment');
const cheerio = require('cheerio');
var fs = require('fs');
var request = require('request');
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
                  image: match.image,
                  time: match.time
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

app.get('/update', async (req, res) => {
  if(req.query.pass && req.query.pass == password) {
    request.get({url: 'https://es.fifa.com/worldcup/matches/?cid=go_box', json: true}, (err, http, body) => {
      if(err || !body) return res.json({error: err});
      parseBody(body, response => {
        return res.json(response);
      });
    });
  } else return res.json({error: 'No password.'});
});

app.post('/create-file', (req, res) => {
  if(req.body.pass && req.body.pass == password && req.body.url && req.body.file_name) {
    download(req.body.url, './public/images/matches/' + req.body.file_name, response => {
      res.json(response);
    });
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
            status: match.status,
            match: match.match,
            image: match.image,
            time: match.time
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
        match.in_about = ' ';
        if(match.status == 'Pendiente') {
          let time = moment(match.date + ' ' + match.time, 'YYYYMMDD HH:mm');
          let now = moment();
          if(time.isValid()) {
            if(moment.duration(time.diff(now))._data.seconds < 0)
              match.in_about = 'EN VIVO';
            else
              match.in_about = 'en ' + moment.duration(time.diff(now)).locale('es').humanize();
          } else {
            match.in_about = ' ';
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

function parseBody (body, callback) {
  let matches = [];
  var $ = cheerio.load(body);
  $('.fi-mu-list').each((index, row) => {
    let matches_row = $(row);
    if(parseInt(matches_row.attr('data-matchesdate')) <= 20180628) {
      matches_row.find('.fi-mu__link').each((index, match) => {
        let match_obj = {};
        let match_row = $(match);
        match_obj.date = matches_row.attr('data-matchesdate');
        match_obj.formatted_date = match_row.find('.fi__info__datetime--abbr').first().text().trim();
        match_obj.group = match_row.find('.fi__info__group').first().text().trim();
        match_obj.status = match_row.find('span.period:not(.hidden)').first().text().trim() || 'Pendiente';

        let team_home = match_row.find('.fi-t.home').first();
        match_obj.team_home = team_home.find('.fi-t__nText').first().text().trim();
        let team_away = match_row.find('.fi-t.away').first();
        match_obj.team_away = team_away.find('.fi-t__nText').first().text().trim();

        match_obj.time = match_row.find('.fi-s__score.fi-s__date-HHmm').first().attr('data-timelocal');

        let score = match_row.find('span.fi-s__scoreText').first().text().trim();
        if(score.indexOf("-") == -1) {
          console.log(score);
          match_obj.time = moment(score, "HH:mm").subtract(2, 'hours').format('HH:mm');
          match_obj.score = 'vs';
          match_obj.score_home = "0";
          match_obj.score_away = "0";
        } else {
          match_obj.score = score;
          match_obj.score_home = score.split('-')[0];
          match_obj.score_away = score.split('-')[1];
        }

        match_obj.match = matches.length + 1;
        if (fs.existsSync(__dirname + '/public/images/matches/' + match_obj.match + '.jpg')) {
          match_obj.image = 'http://ec2-54-200-239-86.us-west-2.compute.amazonaws.com/images/matches/' + match_obj.match + '.jpg';
        } else {
          match_obj.image = 'http://ec2-54-200-239-86.us-west-2.compute.amazonaws.com/images/russia_back.jpg';
        }

        matches.push(match_obj);
      });
    }
  });

  let promises = [];
  for(match of matches) {
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
            image: match.image,
            time: match.time
          }
        }
      )
    );
  }

  Promise.all(promises).then(results => {
    console.log('All updated!');
    return callback(results);
  }, err => {
    console.log(err);
    return callback({error: err});
  });
}

var download = function(url, dest, callback) {
  let file = fs.createWriteStream(dest);
  request(url).on('error', err => {
    fs.unlink(dest);
    return callback({success: false, error: err});
  })
  .pipe(file)
  .on('finish', () => {
    file.close();
    return callback({success: true});
  });
};
