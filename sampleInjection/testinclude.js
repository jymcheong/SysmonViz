var fs = require("fs")
eval(fs.readFileSync(__dirname + '/db.js')+'');

console.log(ODB_User)