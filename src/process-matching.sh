#!/bin/bash

cd ../data
for i in *; do
	if [ -f "$i/edu.mit.media.funf.bgcollector/csv_$i/Matching.csv" ]; then
		echo -n "tablet $i ";
		perl ../src/process-matching.pl $i/edu.mit.media.funf.bgcollector/csv_$i/Matching.csv;
	else
		echo "No data for tablet $i";
	fi
done
cd ../src
