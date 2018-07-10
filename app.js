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

var CronJob = require('cron').CronJob;
var job = new CronJob('*/2 9-16 * * *', async function() {
    runUpdateFunction();
  },
  null,
  true,
  'America/Mexico_City'
);

if(job.running) console.log('Cron running!');
else console.log('Cron ERROR. Will not update data automatically!');

app.use('/facebook', require('./routes/index'));

app.get('/', (req, res) => {
  res.send('Pulpo Bot v1.0');
});

app.get('/update', async (req, res) => {
  if(req.query.pass && req.query.pass == password) {
    try {
      let response = await updateData();
      if(!response) return res.json({success: false});
      else if(response && response instanceof Array) {
        try {
          var updated = 0;
          response = JSON.parse(JSON.stringify(response));
          for(let item of response) {
            if(item.nModified) updated++;
          }
          return res.json({updated_items: updated});
        } catch (e) {
          console.log(e);
          return res.json({status: 'data updated', error: e});
        }
      } else return res.json(response);
    } catch (e) {
      console.log(e);
      return res.json({error: e});
    }
  } else return res.json({error: 'No password.'});
});

app.post('/update', async (req, res) => {
  if(req.body.pass && req.body.pass == password && req.body.update && req.body.update.match) {
    let match = req.body.update;
    let update_object = {};
    for(let key in match) {
      if(key != '_id' && key != 'match')
        update_object[key] = match[key];
    }

    try {
      let update = await updateMatch(
        {
          match: match.match
        },
        {
          $set: update_object
        }
      );

      let found = await findMatches({
        match: match.match
      });

      return res.json({resource: found});
    } catch (e) {
      console.log(e);
      return res.json({error: e});
    }
  } else return res.json({error: 'No password.'});
});

app.post('/find', async (req, res) => {
  let showOnlyLive = false;
  if(req.body.pass && req.body.pass == password) {
    //parse today and set current date
    if(req.body.query && req.body.query.date) {
      if(req.body.query.date == 'TODAY')
        req.body.query.date = moment().format("YYYYMMDD");
    }

    if(req.body.time && req.body.time == 'NOW') {
      showOnlyLive = true;
    }

    try {
      let matches = await findMatches(req.body.query || {}, req.body.limit || 0, req.body.sort || {});
      for(match of matches) {
        match.video = match.video ? match.video : match.match_url + '#match-liveblog';
        match.in_about = ' ';
        match.button_name = 'Ver goles ⚽️';
        if(match.status != 'Final del partido') {
          match.button_name = 'Ver detalles';
          let time = moment(match.date + ' ' + match.time, 'YYYYMMDD HH:mm');
          let now = moment();
          console.log(time.format());
          console.log(now.format());
          if(time.isValid()) {
            if(moment.duration(time.diff(now))._data.seconds < 0) {
              match.in_about = 'EN VIVO';
              match.button_name = 'Minuto a minuto ⏱';
              let minutes_pass = moment.duration(now.diff(time))._data.minutes;
              let hours_pass = moment.duration(now.diff(time))._data.hours;
              if(hours_pass == 0) {
                if(minutes_pass > 0 && minutes_pass <= 48) match.status = minutes_pass + "'";
                else if(minutes_pass > 48 && minutes_pass <= 60) match.status = 'Medio tiempo.';
                else match.status = ' ';
              } else if(hours_pass == 1) {
                if(minutes_pass >= 1 && minutes_pass <= 55) match.status = '2T ' + minutes_pass + "'";
                else if(minutes_pass > 55 && minutes_pass <= 60) match.status = '1er Tiempo extra';
                else match.status = ' ';
              } else if(hours_pass == 2) {
                if(minutes_pass > 0 && minutes_pass <= 18) match.status = '2do Tiempo extra';
                else if(minutes_pass > 20) match.status = 'Penales.';
              } else match.status = ' ';
            }
            else
              match.in_about = moment.duration(time.diff(now)).locale('es').humanize(true) +
              ' (' + match.time + ')';
          } else {
            match.in_about = ' ';
          }
        }
      }

      if(showOnlyLive) {
        matches = matches.filter(match => {
          return match.in_about == 'EN VIVO';
        });
      }

      return res.status(matches.length ? 200 : 500).json({matches: matches});
    } catch (e) {
      return res.status(500).json({error: e});
    }
  } else return res.json({error: 'No password.'})
});

app.post('/create-file', (req, res) => {
  if(req.body.pass && req.body.pass == password && req.body.url && req.body.file_name) {
    download(req.body.url, './public/images/matches/' + req.body.file_name, response => {
      runUpdateFunction();
      return res.json(response);
    });
  } else return res.json({error: 'No password.'});
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

let updateMatch = (item, newData, opts) => {
  return new Promise ((resolve, reject) => {
    mongo.connect(mongo_url, function (err, db) {
      if(err) return resolve(null);
      var dbase = db.db(db_name);
      dbase.collection('match').updateOne(item, newData, opts || {}, function (err, res) {
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

function parseMatchesData (body, callback) {
  let matches = [];
  var $ = cheerio.load(body);
  $('.fi-mu-list').each((index, row) => {
    let matches_row = $(row);
    matches_row.find('.fi-mu__link').each((index, match) => {
      let match_obj = {};
      let match_row = $(match);
      match_obj.date = matches_row.attr('data-matchesdate');
      if(!match_obj.date)
        match_obj.date = moment.utc(match_row.find('.fi-mu__info__datetime').first().attr('data-utcdate')).format('YYYYMMDD');
      match_obj.match_url = 'https://es.fifa.com' + match_row.attr('href');
      match_obj.match_id = match_row.find('.fi-mu.result').first().attr('data-id');
      if(!match_obj.match_id)
        match_obj.match_id = match_row.find('.fi-mu.fixture').first().attr('data-id');
      match_obj.formatted_date = match_row.find('.fi__info__datetime--abbr').first().text().trim();
      match_obj.group = match_row.find('.fi__info__group').first().text().trim();
      if(match_obj.group == '')
        match_obj.group = matches_row.find('span.fi-mu-list__head__date').first().text().trim();
      match_obj.status = match_row.find('span.period:not(.hidden)').first().text().trim() || 'Pendiente';

      let team_home = match_row.find('.fi-t.home').first();
      match_obj.team_home = team_home.find('.fi-t__nText').first().text().trim();
      let team_away = match_row.find('.fi-t.away').first();
      match_obj.team_away = team_away.find('.fi-t__nText').first().text().trim();

      match_obj.time = match_row.find('.fi-s__score.fi-s__date-HHmm').first().attr('data-timeutc');
      match_obj.time = moment(match_obj.time, "HH:mm").subtract(5, 'hours').format('HH:mm');

      let score = match_row.find('span.fi-s__scoreText').first().text().trim();
      if(score.indexOf("-") == -1) {
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
  });

  return callback(matches);
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

var updateData = function () {
  return new Promise((resolve, reject) => {
    request.get({url: 'https://es.fifa.com/worldcup/matches/?cid=go_box', json: true}, (err, http, body) => {
      if(err || !body) resolve(null);
      parseMatchesData(body, matches => {
        let promises = [];
        for(match of matches) {
          promises.push(
            updateMatch(
              {
                match: match.match
              },
              {
                $set: {
                  date: match.date,
                  formatted_date: match.formatted_date,
                  group: match.group,
                  status: match.status,
                  team_home: match.team_home,
                  team_away: match.team_away,
                  time: match.time,
                  score: match.score,
                  score_home: match.score_home,
                  score_away: match.score_away,
                  image: match.image,
                  match: match.match,
                  match_id: match.match_id,
                  match_url: match.match_url
                }
              },
              {
                upsert: true
              }
            )
          );
        }

        Promise.all(promises).then(results => {
          console.log('All updated!');
          return resolve(results);
        }, err => {
          console.log(err);
          return resolve({error: err});
        });
      });
    });
  });
};

var runUpdateFunction = async function () {
  try {
    let response = await updateData();
    if(response && response instanceof Array) {
      try {
        var updated = 0;
        response = JSON.parse(JSON.stringify(response));
        for(let item of response) {
          if(item.nModified) updated++;
        }
        console.log('CRON triggered. Updated: ' + updated);
      } catch (e) {
        console.log(e);
      }
    } else console.log(response);
  } catch (e) {
    console.log(e);
  }
};
