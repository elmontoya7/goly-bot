let matches = [];
$('.fi-mu-list').each((index, row) => {
  let matches_row = $(row);
  if(parseInt(matches_row.attr('data-matchesdate')) <= 20180628) {
    matches_row.find('.fi-mu__link').each((index, match) => {
      let match_obj = {};
      let match_row = $(match);
      match_obj.date = matches_row.attr('data-matchesdate');
      match_obj.formatted_date = match_row.find('.fi__info__datetime--abbr').first().text().trim();
      match_obj.group = match_row.find('.fi__info__group').first().text().trim();
      match_obj.status = match_row.find('span.period:not(:hidden)').first().text().trim() || 'Pendiente';

      let team_home = match_row.find('.fi-t.home').first();
      match_obj.team_home = team_home.find('.fi-t__nText').first().text().trim();
      let team_away = match_row.find('.fi-t.away').first();
      match_obj.team_away = team_away.find('.fi-t__nText').first().text().trim();

      match_obj.time = match_row.find('.fi-s__score.fi-s__date-HHmm').first().attr('data-timelocal');

      let score = match_row.find('span.fi-s__scoreText').first().text().trim();
      if(score.indexOf("-") == -1) {
        match_obj.score = '0-0';
        match_obj.score_home = "0";
        match_obj.score_away = "0";
      } else {
        match_obj.score = score;
        match_obj.score_home = score.split('-')[0];
        match_obj.score_away = score.split('-')[1];
      }

      match_obj.match = matches.length + 1;
      matches.push(match_obj);
    });
  }
});

console.log(JSON.stringify(matches));
