const fs = require("fs")
eval(fs.readFileSync(__dirname + '/common.js')+'');

startLiveQuery("select from Sysmon")

function linkNewEvent(classname, sourceRID, targetRID){
        //console.log(classname + ' link ' + sourceRID + ' to ' + targetRID)
        sql = 'CREATE EDGE ' + _edgeLookup[classname] + ' FROM ' + sourceRID + ' TO ' + targetRID
        _session.command(sql)
        .on("data", data => {
            console.log('Connecting ' + _edgeLookup[classname] + ' FROM ' + sourceRID + ' TO ' + targetRID)
            _session.command('UPDATE '+ targetRID + ' SET ToBeProcessed = false')
        })
        .on('error',(err)=> {
            console.log(err)
        })
}

function eventHandler(newEvent) {
    if(newEvent['Image'] == 'System') return
    switch(newEvent['@class']){
      case "NetworkConnect":  //ID3: ProcessCreate-[ConnectedTo]->NetworkConnect 
            if(newEvent['@class'] == 'FileCreate') console.log('FileCreate came in...' + newEvent['@rid'])
            fs.readFile(_cacheProcessCreateRID + '/' + newEvent['Hostname'] + newEvent['ProcessGuid'], function(err, processCreateRid){
                if(err) { // not in cache, find in database
                    if(newEvent['@class'] == 'FileCreate') console.log('Trying database to find for ' + newEvent['@rid']+ '...')
                    _session.query("select from (select from processcreate where ProcessGuid = :guid) where Hostname = :hostname", 
                    { params : {guid: newEvent['ProcessGuid'], hostname: newEvent['Hostname']}})
                    .on("data", data => {
                        linkNewEvent(newEvent['@class'],data['@rid'], newEvent['@rid'])  
                        console.log('Writing ' + newEvent['ProcessGuid'] + ' to cache folder for ' + newEvent['@rid'])
                        fs.writeFile(_cacheProcessCreateRID + '/' + newEvent['Hostname'] + newEvent['ProcessGuid'], data['@rid'], function(err) { if(err) console.log(err) });
                    })                  
                }
                else
                    linkNewEvent(newEvent['@class'],processCreateRid, newEvent['@rid'])
            })   
            break;
    }
}
