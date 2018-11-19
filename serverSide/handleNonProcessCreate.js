const fs = require("fs")
eval(fs.readFileSync(__dirname + '/common.js')+'');

startLiveQuery("select from Sysmon")

function linkNewEvent(classname, sourceRID, targetRID){
        sql = 'CREATE EDGE ' + _edgeLookup[classname] + ' FROM ' + sourceRID + ' TO ' + targetRID
        _session.command(sql)
        .on("data", data => {
            updateToBeProcessed(targetRID)
        })
        .on('error',(err)=> {
            var msg = '' + err
            if(msg.indexOf('UPDATE') > 0) {
                console.log('retrying linkNewEvent... targetRID:' + targetRID)
                linkNewEvent(classname, sourceRID, targetRID)
            }
            else console.error(msg)
        })
}

function eventHandler(newEvent) {
    if(newEvent['Image'] == 'System') return
    switch(newEvent['@class']){
        case "ImageLoad":
        case "ProcessTerminate"://ID5: ProcessCreate-[Terminated]->ProcessTerminate     	
        case "PipeCreated":	    //ID17: ProcessCreate-[CreatedPipe]->PipeCreated	
        case "PipeConnected":   //ID18: ProcessCreate-[ConnectedPipe]->PipeConnected
        case "RawAccessRead":   //ID9: ProcessCreate-[RawRead]->RawAccessRead
        case "FileCreateTime":  //ID2: ProcessCreate-[ChangedFileCreateTime]->FileCreateTime	
        case "FileCreate": 	    //ID11: ProcessCreate-[CreatedFile]->FileCreate 
        case "FileCreateStreamHash": //ID15: ProcessCreate-[CreatedFileStream]->FileCreateStreamHash    
        case "RegistryEvent":   //ID13&14: ProcessCreate-[AccessedRegistry]->RegistryEvent
        //case "NetworkConnect":  //ID3: ProcessCreate-[ConnectedTo]->NetworkConnect 
            //if(newEvent['@class'] == 'FileCreate') console.log('FileCreate came in...' + newEvent['@rid'])
            fs.readFile(_cacheProcessCreateRID + '/' + newEvent['Hostname'] + newEvent['ProcessGuid'], function(err, processCreateRid){
                if(err) { // not in cache, find in database
                    //if(newEvent['@class'] == 'FileCreate') console.log('Trying database to find for ' + newEvent['@rid']+ '...')
                    _session.query("select from (select from processcreate where ProcessGuid = :guid) where Hostname = :hostname", 
                    { params : {guid: newEvent['ProcessGuid'], hostname: newEvent['Hostname']}})
                    .on("data", data => {
                        linkNewEvent(newEvent['@class'],data['@rid'], newEvent['@rid'])  
                        //if(newEvent['@class'] == 'FileCreate') console.log('Writing ' + newEvent['ProcessGuid'] + ' to cache folder for ' + newEvent['@rid'])
                        fs.writeFile(_cacheProcessCreateRID + '/' + newEvent['Hostname'] + newEvent['ProcessGuid'], data['@rid'], function(err) { if(err) console.log(err) });
                    })                  
                }
                else
                    linkNewEvent(newEvent['@class'],processCreateRid, newEvent['@rid'])
            })   
            break;
    }
    if(newEvent['@class'] == 'ProcessTerminate') {
        var filepath = _cacheProcessCreateRID + '/' + newEvent['Hostname'] + newEvent['ProcessGuid']
        if(fs.existsSync(filepath)){
            fs.unlink(filepath, (err) => {
                if (err) {
                    console.error(err)
                    return
                } 
              });
        }
    }
}
