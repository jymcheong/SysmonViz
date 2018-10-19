var fs = require("fs")
eval(fs.readFileSync(__dirname + '/db.js')+'');


db.query('select from processcreate limit 2')
  .then(function(response){ 
    console.log(response.length)
    for(var i = 0; i < response.length; i++){
        var pc = response[i]
        console.log(pc['@rid'].toString())
    }
   });