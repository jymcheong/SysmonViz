const fs = require("fs")
eval(fs.readFileSync(__dirname + '/common.js')+'');

async function asyncCall() {
    console.log('calling');
    var result = await connectODB();
    console.log(result);
    _handle = await _session.liveQuery('select from processcreate')
    .on("data", data => {
        console.log(data)
    })
    _handles.push(_handle)
    _handle = await _session.liveQuery('select from networkconnect')
    .on("data", data => {
        console.log(data)
    })
    _handles.push(_handle)
    // expected output: 'resolved'
}
  
asyncCall();