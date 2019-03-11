const fs = require("fs")
eval(fs.readFileSync(__dirname + '/common.js')+'');


async function test(){
    await connectODB()
    console.log('db connected')
    _handle = await _session.liveQuery('select from Sysmon').on("data", data => {
        console.log('first event handler')
    })
    _handles.push(_handle)
    _handle = await _session.liveQuery('select from Winevent').on("data", data => {
        console.log('2nd event handler')
    })
    _handles.push(_handle)
}

test()
