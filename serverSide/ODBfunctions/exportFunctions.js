const fs = require("fs")
eval(fs.readFileSync(__dirname + '/../common.js')+'')

async function exportFunctions(){
    await connectODB()
    var output = '{"records":[';
    _session.query("select @this.toJSON() from OFunction")
    .all()
    .then((results)=> {
        for(var i = 0; i < results.length; i++) {
            output += results[i]['@this.toJSON()'] + ','
        }
        output = output.slice(0,-1) + "]}"
        //console.log(output)
        fs.writeFile('functions.json', output, function(err) {
            if(err) {
                return console.log(err);
            }
            console.log("The file was saved!");
            process.exit()
        }); 
    })
}

exportFunctions();
