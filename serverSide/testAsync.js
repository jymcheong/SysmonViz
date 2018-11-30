const fs = require("fs")
eval(fs.readFileSync(__dirname + '/common.js')+'');

async function asyncCall() {
    console.log('calling');
    var result = await connectODB();
    console.log(result);
    // expected output: 'resolved'
}
  
asyncCall();
  