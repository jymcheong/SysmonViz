// NOT FOR PRODUCTION USE
var ODB_User = 'root'
var ODB_pass = 'Password1234'
var OrientDB = require('orientjs');
var server = OrientDB({host: 'localhost', port: 2424});
var db = server.use({name: 'DataFusion', username: ODB_User, password: ODB_pass, useToken : false});

process.stdin.resume();//so the program will not close instantly
function exitHandler(err) {
    console.log('cleaning up...')
    db.close().then(function(){
        process.exit();
    })
}
process.on('exit', exitHandler.bind(null));
process.on('SIGINT', exitHandler.bind(null));
process.on('SIGUSR1', exitHandler.bind(null));
process.on('SIGUSR2', exitHandler.bind(null));
process.on('uncaughtException', exitHandler.bind(null));

db.query('select from processcreate')
  .then(function(response){ 
    console.log(response.length)
    for(var i = 0; i < response.length; i++){
        var pc = response[i]
        console.log(pc['@rid'].toString())
    }
   });