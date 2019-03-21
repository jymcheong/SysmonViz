~/orientdb-3.0.17/bin/console.sh "use remote:localhost/DataFusion root Password1234; export database schema.gz -includeRecords=false;"
node exportFunctions.js
mv schema.gz ../
mv functions.json ../