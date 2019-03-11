const fs = require("fs")

function pollDirectory(directory_to_monitor){
    fs.readdir(directory_to_monitor, function(err, items) {
        console.log(items)
    })
}

setInterval(function(){ pollDirectory('/Users/jymcheong/eventUpload')},1000)