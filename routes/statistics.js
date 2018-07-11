var express = require('express');
var router = express.Router();
var request = require('request');

var types = Object.freeze({
  goals: 'https://es.fifa.com/worldcup/statistics/players/goal-scored',
  saves: 'https://es.fifa.com/worldcup/statistics/players/saves',
  shots: 'https://es.fifa.com/worldcup/statistics/players/shots',
  cards: 'https://es.fifa.com/worldcup/statistics/players/disciplinary'
});

router.get('/update', (req, res) => {

});

var updateData = type => {
  return new Promise((resolve, reject) => {
    request.get({url: types[type], json:true}, (err, http, body) => {
      if(err || !body) return resolve(null);
      return resolve('ok');
    });
  });
};

module.exports = router;
