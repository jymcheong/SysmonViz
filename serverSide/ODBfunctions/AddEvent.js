/**
 * 1. Use ODB WebStudio Function Management (FM)
 * 2. Create a function AddEvent with two parameters: classname, jsondata
 * 3. Paste the codes below into the FM's editor & save  
 */
var db = orient.getDatabase();

// edge class look up table to minimize repeated queries; vertex-class to edge-class
var edgeLookup = {'ProcessTerminate':'Terminated', 'PipeCreated':'CreatedPipe',
                'PipeConnected':'ConnectedPipe', 'RawAccessRead':'RawRead',
                'FileCreateTime':'ChangedFileCreateTime', 'FileCreate':'CreatedFile',
                'FileCreateStreamHash':'CreatedFileStream', 'RegistryEvent':'AccessedRegistry',
                'NetworkConnect':'ConnectedTo', 'ImageLoad':'LoadedImage'}

// EventId to Classname
var eventIdLookup = {1:'ProcessCreate', 2:'FileCreateTime', 3:'NetworkConnect', 
                    4:'SysmonStatus', 5:'ProcessTerminate',6:'DriverLoad', 
                    7:'ImageLoad', 8:'CreateRemoteThread', 9:'RawAccessRead', 
                    10:'ProcessAccess', 11:'FileCreate', 12:'RegistryEvent', 
                    13:'RegistryEvent', 14:'RegistryEvent', 15:'FileCreateStreamHash', 
                    16:'ConfigChanged', 17:'PipeCreated', 18:'PipeConnected', 
                    19:'WmiEvent', 20:'WmiEvent', 21:'WmiEvent', 255:'Error' }

// fix issue #104 - illegal field names
function rewriteProperties(obj) {
  var notValid = /[\W_]+/g
  if (typeof obj !== "object") return obj; //that is not a typo, it checks value & type
  for (var prop in obj) {
      if (obj.hasOwnProperty(prop)) {
          obj[prop.replace(notValid, "")] = rewriteProperties(obj[prop]);
          if (notValid.test(prop)) {
              delete obj[prop];
          }
      }
  }
  return obj;
}                       

function retry(command){
    try {
        eval(command) 
    }
    catch(err){
        var e = '' + err
        if(e.indexOf('UPDATE') > 0) {
            print('Retrying ' + command)
            retry(command)
        }
      	else print(command + " retry exception: " + err)
    }
}

function checkSpoof(e, rid){
    var spoof = db.query('SELECT @rid, TrueParentProcessId FROM SpoofParentProcessId Where ToBeProcessed = true \
							 AND Hostname = ? AND ProcessGuid = ?', e['Hostname'], e['ProcessGuid']);
    if(spoof.length > 0) {
    	print('found spoof for ' + rid + ' true parentPID = ' + spoof[0].getProperty('TrueParentProcessId'))//SpoofedParentProcess
        retry("db.command('CREATE EDGE SpoofedParentProcess FROM " + spoof[0].getProperty('@rid') + " to " + rid + "')")
        var trueParent = db.query('SELECT FROM ProcessCreate WHERE ProcessId = ? order by id desc limit 1', spoof[0].getProperty('TrueParentProcessId') )
        if(trueParent.length > 0) {
            retry("db.command('CREATE EDGE TrueParentOf FROM " + trueParent[0].getProperty('@rid') + " to " + rid + "')")
        }
	}
}

function checkForeign(e, pc_rid, classname, insertSQL) {
  	var foreign = db.query('SELECT @rid FROM UntrustedFile Where ToBeProcessed = true \
					  AND Type = ? AND Hostname = ? AND ProcessGuid = ?', 
                      classname, e['Hostname'], e['ProcessGuid']);
    
	if(foreign.length > 0){
        if(insertSQL.length >0) {
        	var dll = db.command(insertSQL);
            pc_rid = dll[0].getProperty('@rid');
        }
    	var edgename = classname == 'ProcessCreate' ? "ExeSighted" : "DllSighted";
        print('Link '+ edgename + ' from ' + foreign[0].getProperty('@rid') + ' to ' + pc_rid)
        retry("db.command('CREATE EDGE " + edgename + " FROM " + foreign[0].getProperty('@rid') +" TO " + pc_rid + "')")
        retry("db.command('UPDATE " + foreign[0].getProperty('@rid') +" SET ToBeProcessed = false')")
            //db.command('INSERT INTO Watchlist SET Hostname = ?, ProcessGuid = ?, rid = ?', e['Hostname'], e['ProcessGuid'], pc_rid)
	}
}


var logline = unescape(jsondata)
try {
  var e = rewriteProperties(JSON.parse(logline)); 
}
catch(err) {
   print(Date() + ' Offending line ' + logline);
   db.command('INSERT INTO FailedJSON SET line = ?', logline)
   return
}

e['ToBeProcessed'] = true
classname = 'WinEvent'

// This Keywords field is a huge negative number that breaks record insertion
if(e['Keywords'] != undefined) {
    e['Keywords'] = '' + e['Keywords'] // turn it to string
}

// Pre-process Sysmon events
if(e["SourceName"] == "Microsoft-Windows-Sysmon"){
    classname = eventIdLookup[e['EventID']]
    e['SysmonProcessId'] = e['ProcessID']
    delete e['ProcessID']
    var re = /ProcessId: (\d+)/g
    var match = re.exec(e['Message'])
    if(match != null) e['ProcessId'] = parseInt(match[1]);
    if(e["SourceProcessGUID"]) e["SourceProcessGuid"] = e["SourceProcessGUID"]; 
    if(e["TargetProcessGUID"]) e["TargetProcessGuid"] = e["TargetProcessGUID"]; 
}

// DataFusion Process Monitor events
if(e["SourceName"] == "DataFusionProcMon"){
    var classname = e['Class']; delete e['Class'];
    db.command("INSERT INTO "+ classname + " CONTENT " + JSON.stringify(e));
	return;
}

  
// DataFusion UAT events
if(e["SourceName"] == "DataFuseUserActions"){
    classname = 'UserActionTracking'
    delete e['ProcessID']
    try {
        var uat = JSON.parse(e['Message'])
    }
    catch(err) {
        print(Date() + ' Offending DataFuseUserActions ' + e['Message'])
        print(logline)
        db.command('INSERT INTO FailedJSON SET line = ?', logline)
        return
    }
    for(var k in uat){
        e[k] = uat[k]
    }
}

// DataFusion network events v2
if(e["SourceName"] == "DataFuseNetwork_v2"){
	if(e['EventID']==3 || e['EventID']==4) {
    	var lp = db.command('UPDATE NetworkListeningPort set Count = Count + 1 \
                          UPSERT RETURN AFTER @rid, Count WHERE Hostname = ? AND TransportProtocol = ? \
                          AND LocalAddress = ? AND LocalPort = ? AND ProcessId = ? AND ProcessName = ?',
                          e['Hostname'], e['TransportProtocol'], e['LocalAddress'], e['LocalPort'],e['ProcessId'],e['ProcessName'])
              
        if(lp[0].getProperty('Count') == 1){ // new listening port
        	//print('Found new listening port ' + e['LocalPort'] + ' for ' + e['Hostname'])
            db.command('CREATE EDGE ListeningPortSighted FROM ? TO \
                      (SELECT FROM ProcessCreate WHERE Hostname = ? AND ProcessId = ? order by id desc LIMIT 1)'
            		  ,lp[0].getProperty('@rid'),e['Hostname'], e['ProcessId'])
		}	
    }
  	if(e['EventID']==1 || e['EventID']==2) {
       print('network address found')
       db.command('UPDATE NetworkAddress set Count = Count + 1 \
                    UPSERT RETURN AFTER @rid, Count WHERE Hostname = ? AND PhysicalAddress = ? AND IpAddress = ?',
                    e['Hostname'], e['PhysicalAddress'],e['IpAddress'])
    }
    return; // no need to insert events since they come in every 3 seconds serving as heartbeat for DataFusion service.
}

// DataFusion network events
if(e["SourceName"] == "DataFuseNetwork"){
    classname = 'NetworkDetails'
    delete e['ProcessID']
    try {
        var uat = JSON.parse(e['Message'])
        for(var k in uat){
            oldk = k // we don't want numbers as column names; can't via queries
            k = /^\d+$/.test(k) ? 'column'+ k : k;
            if(typeof uat[oldk] === 'object') {
              if(e['EventID']==3 || e['EventID']==4) {
                  var transportProtocol = e['EventID']==3 ? 'TCP' : 'UDP';
                  // tracking Process-ListeningPorts
                  var lp = db.command('UPDATE NetworkListeningPort set Count = Count + 1 \
                          UPSERT RETURN AFTER @rid, Count WHERE Hostname = ? AND TransportProtocol = ? \
                          AND LocalAddress = ? AND LocalPort = ? AND ProcessId = ? AND ProcessName = ?',
                          e['Hostname'], transportProtocol, uat[oldk]['LocalAddress'],uat[oldk]['LocalPort']
                          ,uat[oldk]['ProcessId'],uat[oldk]['ProcessName'])
                  // new listening port
                  if(lp[0].getProperty('Count') == 1){
                      //print('Found new listening port ' + uat[oldk]['LocalPort'] + ' for ' + e['Hostname'])
                      db.command('CREATE EDGE ListeningPortSighted FROM ? TO \
                      (SELECT FROM ProcessCreate WHERE Hostname = ? AND ProcessId = ? order by id desc LIMIT 1)'
                          ,lp[0].getProperty('@rid'),e['Hostname'], uat[oldk]['ProcessId'])
                  }
              }
              if(e['EventID']==1 || e['EventID']==2) {
                  print('\nNetworkDetails EventID = ' + e['EventID'])
                  print('Physical address: ' + uat[oldk]['PhysicalAddress'] + '\n')
                  for(var k2 in uat[oldk]['IPAddresses']) {
                      print(k2 + ' has a value of ' + uat[oldk]['IPAddresses'][k2])
                      db.command('UPDATE NetworkAddress set Count = Count + 1 \
                                  UPSERT RETURN AFTER @rid, Count WHERE Hostname = ? AND PhysicalAddress = ? AND IpAddress = ?',
                                  e['Hostname'], uat[oldk]['PhysicalAddress'],uat[oldk]['IPAddresses'][k2])
                  }
              }
            }
            e[k] = uat[oldk]
        }
    }
    catch(err){
        print(Date() + ' Offending DataFuseNetwork ' + e['Message'] + '\n' + err)
        return
    }
}   

//--Start insertion of the event------
if(e['Message'] != null) delete e['Message'] //problematic for server-side parsing... it is repeated data anyway
var jsonstring = JSON.stringify(e)
var id = (new Date())*1
jsonstring = jsonstring.slice(0,-1) + ",\"id\":" + id + '}'
var stmt = 'INSERT INTO '+ classname + ' CONTENT ' + jsonstring
if(classname != 'ImageLoad') {
    try {
        var r = db.command(stmt);
    }
    catch(err){
        print(Date() + ' Error inserting ' + stmt)
        return
    }
} else checkForeign(e, "", classname, stmt); //insert foreign DLL within checkForeign
//--End insertion of the event------

switch(classname) {
case "ProcessCreate":
        var current_id = r[0].getProperty('id')
        //print(Date() + " AddEvent for " + classname + " " + e['Image'] + ':' + e['ProcessGuid'] + " on " + e['Hostname'])
        if(e['ParentImage'] == "System") {// smss.exe
            print(Date() + " Found " + e['Image'] + " on " + e['Hostname'])
            // update SMSS.exe ID into cache table to find Type A (BeforeExplorer) process
          	db.command('UPDATE TypeA_id_cache SET smss_id = ? UPSERT \
                        WHERE Hostname = ?',r[0].getProperty('id'),e['Hostname'])
        }
    
        // update explorer.exe ID into cache table to find Type A (BeforeExplorer) process      
        if(e['ParentImage'].indexOf("Windows\\System32\\userinit.exe") > 0) {// explorer.exe
            print(Date() + " Found " + e['Image'] + " on " + e['Hostname'])
            db.command('UPDATE TypeA_id_cache SET explorer_id = ? UPSERT \
                        WHERE Hostname = ?',r[0].getProperty('id'),e['Hostname'])
        }
        
        // ImageHashes tracking
        var u = db.command('UPDATE ImageHashes set Count = Count + 1 \
                            UPSERT RETURN AFTER @rid, Count WHERE Image = ? AND Hashes = ?',
                            e['Image'],e['Hashes'])
        u = db.command('UPDATE ImageHashes set HashCount = HashCount + 1 \
                        RETURN AFTER @rid, Count, HashCount, BaseLined WHERE Hashes = ?',e['Hashes'])

        var IHT_rid = u[0].getProperty('@rid')
          
    	checkForeign(e, r[0].getProperty('@rid'), classname, "");
    	checkSpoof(e, r[0].getProperty('@rid'));
    
        // CommandLine tracking
        u = db.command('UPDATE HostUserPrivilegeCommandLine set Count = Count + 1 \
                        UPSERT RETURN AFTER @rid, Count WHERE \
                        Hostname = ? AND User = ? AND CommandLine = ? AND IntegrityLevel = ?'
                        ,e['Hostname'],e['User'],e['CommandLine'],e['IntegrityLevel'])
    	
        var HUPC_rid = u[0].getProperty('@rid')
	    
        // Check Process Type 
        var t = db.query('select from TypeA_id_cache Where Hostname = ?', e['Hostname'])
    	if(t.length > 0) {
          if(current_id > t[0].getProperty('smss_id') && current_id > t[0].getProperty('explorer_id') 
             && t[0].getProperty('explorer_id') > t[0].getProperty('smss_id')) {
              retry("db.command('CREATE EDGE PendingType from ? TO ?',HUPC_rid, r[0].getProperty('@rid'))")
          }
          else {
              retry("db.command('UPDATE ? SET ProcessType = ?', HUPC_rid,'BeforeExplorer')")
              retry("db.command('UPDATE ? SET ProcessType = ?', r[0].getProperty('@rid'),'BeforeExplorer')")
          }          
        }
        
        // assign if any exact same commandline with existing score > 0
        var score = db.query('select from commandlinecluster where Score > 0 AND CommandLine = ?',e['CommandLine'])
    	if(u[0].getProperty('Count') == 1 || score.length > 0) {  // note OR condition
        	retry("db.command('CREATE EDGE CommandLineSighted FROM ? TO ?',u[0].getProperty('@rid'),r[0].getProperty('@rid'))")
            retry("db.command('CREATE EDGE HasHashes FROM ? to ?', HUPC_rid, IHT_rid)")                 
        }
    
        break;
    
case "ImageLoad": 
        // track Full-path & Hashes
        var u = db.command('UPDATE ImageLoadedHashes set Count = Count + 1 \
                    UPSERT RETURN AFTER @rid, Count WHERE ImageLoaded = ? AND Hashes = ?',
                    e['ImageLoaded'],e['Hashes'],e['ImageLoaded'],e['Hashes'])
        // track ONLY Hashes
        u = db.command('UPDATE ImageLoadedHashes set HashCount = HashCount + 1 \
                    UPSERT RETURN AFTER @rid, HashCount, BaseLined WHERE Hashes = ?',e['Hashes'])
   		    
        break;
    
case "DriverLoad": //ID6
        var u = db.command('UPDATE ImageLoadedHashes set Count = Count + 1 \
                    UPSERT RETURN AFTER @rid, Count, BaseLined WHERE ImageLoaded = ? AND Hashes = ?',
                    e['ImageLoaded'],e['Hashes'],e['ImageLoaded'],e['Hashes'])
        
        if(u[0].getProperty('BaseLined') == false) {
            print(Date() + "Sys First Sighting of " + e['ImageLoaded'])
            retry("db.command('CREATE EDGE SysSighted from ? TO ?', u[0].getProperty('@rid'), r[0].getProperty('@rid'))")
            retry("db.command('CREATE EDGE UsedAsDriver FROM (SELECT FROM FileCreate WHERE Hostname = ? AND TargetFilename in (SELECT DriverLoad FROM ?) order by id desc limit 1) TO ?','" + e['Hostname'] + "',r[0].getProperty('@rid'),r[0].getProperty('@rid'))")
        }
        break;

case "CreateRemoteThread": //ID8 - CreateRemoteThread-[RemoteThreadFor:TargetProcessGuid]->ProcessCreate
        //print('handling CreateRemoteThread ' + e['TargetProcessGuid'] + ' ' + e['Hostname'])
        var target = db.query('SELECT FROM (SELECT FROM ProcessCreate WHERE ProcessGuid = ?) WHERE Hostname = ?',
                            e['TargetProcessGuid'],e['Hostname']);
        if(target.length > 0) {
          //print('Found ' +  target[0].getProperty('@rid'));
          db.command('CREATE EDGE RemoteThreadFor FROM ? TO ?', r[0].getProperty('@rid'), target[0].getProperty('@rid'));
          //print('Done RemoteThreadFor')
        }      
        // ProcessCreate-[CreatedThread:SourceProcessGuid]->CreateRemoteThread
        db.command('CREATE EDGE CreatedThread FROM (SELECT FROM (SELECT FROM ProcessCreate WHERE ProcessGuid = ?) \
                    WHERE Hostname = ?) TO ?',e['SourceProcessGuid'],e['Hostname'],r[0].getProperty('@rid'))
        //print('Done CreatedThread')
        break;
    
case "NetworkConnect":       
        var u = db.command('UPDATE NetworkDestinationPort set Count = Count + 1 \
                        UPSERT RETURN AFTER @rid, Count WHERE Image = ? AND \
                        Hostname = ? AND Port = ?',r[0].getProperty('Image'),r[0].getProperty('Hostname'),r[0].getProperty('DestinationPort'))
        
        if(u[0].getProperty('Count') == 1) { // new destination port sighted for that Process-Image
        	retry("db.command('CREATE EDGE DestinationPortSighted FROM ? TO ?',u[0].getProperty('@rid'),r[0].getProperty('@rid'))")
        } 
    	// look for destination IP address that matches BUT NOT the current Hostname
        var destination = db.query('SELECT FROM NetworkAddress WHERE (IpAddress = ? OR Hostname = ?)\
                                    AND Hostname <> ?',r[0].getProperty('DestinationIp'), r[0].getProperty('DestinationHostname'),r[0].getProperty('Hostname'))    
        if(destination.length == 0) break;
    
    	// find the target listening-port
        var lateral = db.query('SELECT FROM listeningport WHERE Hostname = ? AND \
                        		LocalPort = ?',destination[0].getProperty('Hostname'),r[0].getProperty('DestinationPort'))
        if(lateral.length == 0) break;
        retry("db.command('CREATE EDGE LateralCommunication FROM ? TO ?',r[0].getProperty('@rid'),lateral[0].getProperty('@rid'))")
        
    	// find the Process with that listening-port
        var lpc = db.query('SELECT FROM ProcessCreate WHERE Hostname = ? AND ProcessId = ? \
                            AND Image.IndexOf(?) > -1 order by id desc LIMIT 1', 
                            lateral[0].getProperty('Hostname') ,lateral[0].getProperty('ProcessId'), lateral[0].getProperty('ProcessName'))
        if(lpc.length == 0) break;
    
        // check for existing BoundTo edges
		var lateraledges = db.query('select from (select expand(in_BoundTo) from ?) where out = ? AND in = ?'
        							,lpc[0].getProperty('@rid'), lateral[0].getProperty('@rid'), lpc[0].getProperty('@rid'))
        if(lateraledges.length == 0) { // avoid multiple BoundTo edges during repeated lateral communications
        	print('Adding BoundTo edge between ' + lateral[0].getProperty('@rid') + ' to ' + lpc[0].getProperty('@rid'))
            db.command('CREATE EDGE BoundTo FROM ? TO ?', lateral[0].getProperty('@rid'), lpc[0].getProperty('@rid'))
		}
	
        break;           
}

return