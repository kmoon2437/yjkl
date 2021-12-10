const Events = require('./Events');
const Parser = require('./Parser');
const Commands = require('./Commands');

const STAKATO_TIME = 10;

function clone_object(obj){
    var newobj = {};
    for(var i in obj){
        if(typeof obj[i] == 'object'){
            if(obj[i] instanceof Array) newobj[i] = [...obj[i]];
            else newobj[i] = clone_object(obj[i]);
        }
        else newobj[i] = obj[i];
    }

    return newobj;
}

function parse_header(headers,copyright_protect = false){
    var headers = clone_object(headers);
    var parsed = {
        files:{},
        meta:{},
        other_headers:null
    };

    for(var i in headers){
        if(copyright_protect ? i.match(/^\@file-/g) : i.match(/^file-/g)){
            parsed.files[i.replace(/(@?)file-/i,'')] = headers[i];
            delete headers[i];
        }
        else if(i.match(/^meta-/g)){
            parsed.meta[i.replace('meta-','')] = headers[i];
            delete headers[i];
        }
    }

    parsed.other_headers = headers;

    return parsed;
}

function convert_line(line){
    console.log(line.txt);
    let gen = Parser.parse_sentence(line.txt);
    let syllables = gen.next().value; // 음절
    line.txt = gen.next().value; // 음절 구분용 슬래시(/)가 제거된 문장
    //console.log(syllables,line.txt);
    let line_data = [];
    let old_data = [...line.data];
    if(old_data.length < syllables.filter(a => a.trim()).length){
        // 추가로 넣어야 할 타이밍 이벤트의 수
        let cnt = syllables.length-old_data.length+1;
        let event = old_data.pop();
        let duration = (event.end-event.start)/cnt;
        let ptime = event.start;
        for(let i = 0;i < cnt;i++) old_data.push(new TimingEvent(Math.round(ptime+duration*i),Math.round(ptime+duration*(i+1)),event.current_bpm));
    }else if(old_data.length > syllables.filter(a => a.trim()).length){
        let slen = syllables.filter(a => a.trim()).length;
        old_data[slen-1].end = old_data.pop().end;
        while(old_data.length > slen){
            old_data.pop();
        }
        console.log(old_data,syllables)
    }
    // 가사를 중간에 멈출 수 없도록 막음
    for(let i in old_data){ old_data[i].end = old_data[i-(-1)] ? old_data[i-(-1)].start : old_data[i].end; }
    for(let i in syllables){
        if(syllables[i] == ' '){
            line_data.push({
                text:' ',
                start:line_data[line_data.length-1].end,
                end:line_data[line_data.length-1].end
            });
        }else{
            try{
                let block = old_data.shift();
                block.text = syllables[i];
                line_data.push(block);
            }catch(e){
                console.log(syllables,line.txt);
                throw e;
            }
        }
    }
    line.data = line_data;
    return line;
}

class LineSeparate{
    constructor(){
        this.name = 'LineSeparate';
    }
}
class VerseSeparate{
    constructor(ms){
        this.name = 'VerseSeparate';
        this.hide_delay = ms;
    }
}
class SetLineProperty{
    constructor(key,val){
        this.name = 'SetLineProperty';
        this.key = key;
        this.val = val;
    }
}
class SetVerseProperty{
    constructor(key,val){
        this.name = 'SetVerseProperty';
        this.key = key;
        this.val = val;
    }
}
class TimingEvent{
    constructor(start,end,current_bpm){
        //this.length = length;
        this.start = start;
        this.end = end;
        this.current_bpm = current_bpm;
    }
}

module.exports = class Converter{
    static parse_command_with_tick_duration(commands,headers){
        var bpm = 120;
        var string_events = [];
        var ticks_per_beat = headers.meta['ticks-per-beat'] || 120;
        var playtime = 0;
        for(var cmd of commands){
            switch(cmd.type.toLowerCase()){
                case 'c':{
                    let { name,opts } = Commands.parse(cmd.cmd);
                    let { _unknown:args } = opts;
                    switch(name.toLowerCase()){
                        case 'bpm':{
                            bpm = Parser.parse_number(args[0]);
                        }break;
                        case 'show':{
                            string_events.push(new SetVerseProperty('wait_time',Parser.parse_time(args[0],bpm,ticks_per_beat).ms));
                        }break;
                        case 'count':{
                            string_events.push(new SetVerseProperty('count',parseInt(args[0],10)));
                        }break;
                        case 'delay':{
                            playtime += Parser.parse_time(args[0],bpm,ticks_per_beat).ms;
                        }break;
                        case 'delay_ms':{
                            playtime += Parser.parse_number(args[0]);
                        }break;
                    }
                }break;
                case 't':{
                    cmd.timings.forEach(time => {
                        let start = playtime;
                        let parsed = Parser.parse_time(time,bpm,ticks_per_beat);
                        playtime += parsed.ms;
                        let end = parsed.stakato ? start+STAKATO_TIME : playtime;
                        string_events.push(new TimingEvent(Math.round(start),Math.round(end),bpm));
                    });
                }break;
                case 'l':{
                    if(cmd.end){
                        let end_time = cmd.end_time == '-' ? 0 : cmd.end_time;
                        string_events.push(new VerseSeparate((typeof cmd.end_time != 'undefined')
                        ? Parser.parse_time(end_time,bpm,ticks_per_beat).ms : 0));
                    }else{
                        string_events.push(new LineSeparate());
                    }
                }break;
                case 's':{
                    string_events.push(new SetLineProperty('txt',cmd.sentence));
                }break;
                case 'u':{
                    string_events.push(new SetLineProperty('sub',cmd.sentence));
                }break;
                case 'p':{
                    string_events.push(new SetLineProperty('type',cmd.typecode));
                }break;
            }
        }

        return string_events;
    }

    static convert(data,copyright_protect = false){
        var { headers,commands } = Parser.parse(data);
        var parsed_headers = parse_header(headers,copyright_protect);
        var events = new Events();
        var string_events = null;
        var verses = [];

        switch(parsed_headers.meta['timing-type']){
            case 'tick-duration':{
                string_events = this.parse_command_with_tick_duration(commands,parsed_headers);
            }break;
            case 'ms-timing':{
                string_events = this.parse_command_with_ms_timing(commands,parsed_headers);
            }break;
            default:{
                string_events = this.parse_command_with_tick_duration(commands,parsed_headers);
            }break;
        }

        if(true){
            let first = true;
            let initial_verse = {
                start_bpm:120,
                on_end_hide_delay:0,
                lines:[]
            };
            let initial_line = {
                type:0,
                sub:'',
                data:[],
                txt:''
            };
            let verse = clone_object(initial_verse);
            let line = clone_object(initial_line);

            for(var event of string_events){
                if(event instanceof LineSeparate){
                    verse.lines.push(convert_line(line));
                    line = clone_object(initial_line);
                }else if(event instanceof VerseSeparate){
                    first = true;
                    verse.lines.push(convert_line(line));
                    line = clone_object(initial_line);
                    verse.on_end_hide_delay = event.hide_delay;
                    verses.push(verse);
                    verse = clone_object(initial_verse);
                }else if(event instanceof SetLineProperty){
                    line[event.key] = event.val;
                }else if(event instanceof SetVerseProperty){
                    verse[event.key] = event.val;
                }else if(event instanceof TimingEvent){
                    if(first){
                        verse.start_bpm = event.current_bpm;
                        first = false;
                    }
                    line.data.push(event);
                }
            }
            if(line.data.length){
                verse.lines.push(convert_line(line));
                line = clone_object(initial_line);
            }

            if(verse.lines.length){
                first = true;
                if(line.length) verse.lines.data.push(line);

                line = clone_object(initial_line);
                verses.push(verse);
            }
        }

        var last_end_time = 0;
        var verse_ranges = [];
        var first = true;
        for(var verse of verses){
            let start_count = 4;
            let start_time = verse.lines[0].data[0].start;
            let ganju_duration = verse.lines[0].data[0].start-last_end_time;
            let beat = 60000/verse.start_bpm;
            let verse_range = [0,0];
            let beat_base = 60000/190;
            if(ganju_duration <= beat*20 && ganju_duration <= beat_base*20) start_count = 3;
            if(ganju_duration <= beat*15 && ganju_duration <= beat_base*15) start_count = 2;
            if(ganju_duration <= beat*10 && ganju_duration <= beat_base*10) start_count = 1;
            if(ganju_duration <= beat*4) start_count = 0;
            let first_render = start_time;

            let bottom = false;
            if(verse.lines.length < 2) bottom = true;
            start_count = Math.round(Math.max(0,Math.min(verse.count,4))) || start_count;
            for(var i = 1;i <= start_count;i++){
                events.add(start_time-(beat*i),'countdown',{ val:i,bottom });
                first_render = Math.min(first_render,start_time-(beat*i));
            }

            for(var i = 1;i <= Math.max(0,4-start_count);i++){
                events.add(first_render-i*10,'countdown',{ val:i-start_count,bottom });
            }
            events.add(start_time,'countdown',{ val:null,bottom });
            let initial_minus = 200;
            let minus = initial_minus;
            if(ganju_duration > 25000 && first) minus = Math.min(6000,ganju_duration/2);
            if(verse.wait_time) minus = Math.max(verse.wait_time,initial_minus);
            first_render = Math.max(first_render-minus,0);
            verse_range[0] = first_render-10;

            if(verse.lines.length < 2){
                events.add(first_render,'renderlyrics',{
                    line_code:'b',
                    data:verse.lines[0]
                });
                verse_range[1] = (verse.lines[0].data[verse.lines[0].data.length-1].end+verse.on_end_hide_delay)+10;
                events.add(last_end_time = verse.lines[0].data[verse.lines[0].data.length-1].end+verse.on_end_hide_delay,'hidelyrics',{});
            }else{
                events.add(first_render,'renderlyrics',{
                    line_code:'a',
                    data:verse.lines[0]
                });
                events.add(first_render+125,'renderlyrics',{
                    line_code:'b',
                    data:verse.lines[1]
                });
                let lines = [...verse.lines];
                lines.shift();

                let first = true;
                let line_code = true; // true:a,false:b
                for(var i in lines){
                    if(first){ first = false; continue; }
                    if(!lines[i-1].data.length) continue;
                    events.add(lines[i-1].data[0].start+(lines[i-1].data[0].end-lines[i-1].data[0].start)/2,'renderlyrics',{
                        line_code:line_code ? 'a' : 'b',
                        data:lines[i]
                    });
                    line_code = !line_code;
                }
                let end_time = last_end_time = [...([...verse.lines].reverse()[0]).data].reverse()[0].end+verse.on_end_hide_delay;
                events.add(end_time,'hidelyrics',{});
                verse_range[1] = end_time;
            }
            verse_ranges.push(verse_range);
            first = false;
        }

        if(true){
            let keys = Object.keys(events.get_all());
            let firsteventtime = Math.min(...keys);
            firsteventtime = Math.max(firsteventtime-1600,0);
            events.add(Math.min(10000,firsteventtime),'cleangui',{},true);
            events.add(0,'hidelyrics',{},true);
        }

        parsed_headers.media = '';
        if(parsed_headers.files.zk || parsed_headers.files.midi){
            if(parsed_headers.files.zk){
                parsed_headers.media += 'zk';
            }else if(parsed_headers.files.midi){
                parsed_headers.media += 'midi';
            }
            parsed_headers.media += '-';
            if(parsed_headers.files.mv){
                parsed_headers.media += 'mv';
            }else{
                parsed_headers.media += 'only';
            }
        }else{
            if(parsed_headers.files.mr && parsed_headers.files.mv){
                parsed_headers.media = 'mr-mv';
            }else if(parsed_headers.files.mr && !parsed_headers.files.mv){
                parsed_headers.media = 'mr-only';
            }else if(!parsed_headers.files.mr && parsed_headers.files.mv){
                parsed_headers.media = 'mv-only';
            }
        }

        if(parsed_headers.media == 'zk-mv' || parsed_headers.media == 'midi-mv' || parsed_headers.media == 'mr-mv'){
            let time = parsed_headers.other_headers['mv-timing'] || 0;
            events.add(time,'playmv',{},true);
        }

        return {
            headers:parsed_headers,
            raw_headers:headers,
            events:events.get_all(),
            verses:verses,
            verse_ranges,commands
        };
    }
}