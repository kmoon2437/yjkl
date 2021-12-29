#!/usr/bin/env node

/**
 * ZXEKaraoke Lines Converter
 */

const fs = require('fs');
const { program } = require('commander');
const Lyrics = require('../index');

program
.version(require('../package.json').version, '-v, --version')
.usage('<input file> <output file>')
.description('Convert midi file to zk file')
.parse(process.argv);

let [ inputfile,outputfile ] = program.args;
let opts = program.opts();

if(!inputfile){
    console.error('Input file(first argument) required');
    process.exit();
}
if(!outputfile){
    console.error('Output file(second argument) required');
    process.exit();
}

const PARAM_REGEX = /@(.+?)=(.+?);/g;
const PARAM_PARSE_REGEX = /@(.+?)=(.+?);/;

const input = fs.readFileSync(inputfile,'utf8').replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n\n');
let output = `File-midi: // 적당한 파일명을 지정하세요. 이 부분을 사용하지 않는다면 지워도 좋습니다.
File-zk: // 적당한 파일명을 지정하세요. 이 부분을 사용하지 않는다면 지워도 좋습니다.
File-album: // 적당한 파일명을 지정하세요. 이 부분을 사용하지 않는다면 지워도 좋습니다.
File-mr: // 적당한 파일명을 지정하세요. 이 부분을 사용하지 않는다면 지워도 좋습니다.
File-mv: // 적당한 파일명을 지정하세요. 이 부분을 사용하지 않는다면 지워도 좋습니다.

c bpm 0 // 적당한 bpm을 지정하세요.`;
let verseEnded = true;

for(let verse of input){
    let lines = verse.split('\n');
    for(let line of lines){
        let [ sentence,sub ] = line.split('::');
        let sentence2 = sentence.replace(PARAM_REGEX,'');
        let syllables = Lyrics.Parser.parseSentence(sentence2).next().value.filter(a => a.trim());
        if(!verseEnded) output += '\nl';
        verseEnded = false;
        let matches;
        if(matches = sentence.match(PARAM_REGEX)){
            for(let raw of matches){
                let [ key,value ] = raw.match(PARAM_PARSE_REGEX).slice(1);
                switch(key.toLowerCase()){
                    case 'p': output += `\np ${value}`; break;
                }
            }
        }

        output += `\ns ${sentence2}`;
        if(sub) output += `\nu ${sub}`;

        output += `\nt`;
        for(let i in syllables){
            output += ' 0';
        }
        //output += '\n'+JSON.stringify(syllables)
    }
    output += '\nl 0';
    verseEnded = true;
}

fs.writeFileSync(outputfile,output,'utf8');