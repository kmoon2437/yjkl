const ALPHABETS = require('./alphabets'); // 영어,라틴문자,키릴문자,그리스문자 등등등
const STRING_PLACEHOLDER = '\uf8ff';
const STRABLE_CHARS = ["'",'"'];
const BODY_BLOCK = { '[':']' };
const RUBY_BLOCK = { '{':'}','<':'>' };
const FORCE_SPLIT = '/';
const CONNECT_SYLLABLES = '.';
const SPLIT_ALPHABET = '_';
const ESCAPE = '\\';
const SPACE_REGEX = /[\u0020\u00a0\u3000]+/g; // \u0020(일반 띄어쓰기)와 \u00a0(nbsp), \u3000(일본어 띄어쓰기(?))를 모두 인식
const SPECIAL_CHARS = [FORCE_SPLIT,CONNECT_SYLLABLES,SPLIT_ALPHABET];
const SPECIAL_CHARS2 = [CONNECT_SYLLABLES,SPLIT_ALPHABET];
const SPECIAL_CHARS3 = [...Object.keys(BODY_BLOCK),'('];
const SPECIAL_CHARS4 = [...Object.values(BODY_BLOCK),')'];

function remove_comments(str){
    var strings = [];

    str = str.replace(/"(?:[^"\n\\]*|\\[\S\s])*"|'(?:[^'\n\\]*|\\[\S\s])*'/g,(matched) => {
        strings.push(matched); return STRING_PLACEHOLDER;
    });
    str = str.replace(/\/\/.*/g,'').replace(/\/\*[^*]*\*+(?:[^*\/][^*]*\*+)*\//g,'');
    str = str.replace(new RegExp(STRING_PLACEHOLDER,'g'),() => {
        return strings.shift();
    });

    return str.trim();
}

function str_reverse(str){
    return str.split('').reverse().join('');
}

function str_contains(str,a){
    return str != str_replace_all(str,a,'');
}

function str_replace_all(str,a,b){
    if(a instanceof Array && !(b instanceof Array)){
        for(let s of a){
            str = str_replace_all(str,s,b);
        }
    }else if(b instanceof Array && !(a instanceof Array)){
        for(let s of b){
            str = str_replace_all(str,a,s);
        }
    }else if(a instanceof Array && b instanceof Array){
        let cnt = Math.max(a.length,b.length);
        for(let i = 0;i < cnt;i++){
            str = str_replace_all(str,a[Math.min(i,a.length-1)],b[Math.min(i,b.length-1)]);
        }
    }else{
        while(str.indexOf(a) > -1){
            str = str.replace(a,b);
        }
    }
    return str;
}

class Syllable{
    constructor(s,alphabet = false){
        this.s = s;
        this.alphabet = alphabet;
    }
}

module.exports = class Parser{
    static ALPHABET_REGEX = /(['a-zA-Z])/;

    static parse(data){
        // 주석 제거
        data = remove_comments(data.replace(/\r\n/g,'\n').replace(/\r/g,'\n'));
        
        // header와 content로 분리
        data = data.trim().split(/\n\n+/g);
        var { header,content } = { header:data[0],content:data[1] };
        {
            let arr = [...data];
            arr.shift();
            for(var i in arr){
                arr[i] = arr[i].trim();
            }
            content = arr.join('\n').trim();
        }
        
        // header는 대소문자를 무시한다.
        var headers = {};
        header = header.trim().split('\n');
        for(var h of header){
            var hh = h.split(':');
            var key = hh[0];
            hh.shift();
            var val = hh.join(':');
            let str = val.trim();
            let str_first = str.split('')[0];
            let str_last = str.split('').reverse()[0];
            for(let c of STRABLE_CHARS){
                if(str_first == c && str_last == c){
                    str = str.split('');
                    str.pop();
                    str.shift();
                    str = str.join('');
                    break;
                }
            }
            headers[key.toLowerCase()] = str.trim();
        }
        
        var commands = [];
        content = content.trim().split('\n');
        for(var c of content){
            var cc = c.split(SPACE_REGEX);
            
            var type = cc.shift().toLowerCase();
            var cmd = {};
            cmd.type = type;
            switch(type){
                case 'c':
                    cmd.cmd = c.replace(/c( +)/i,'').trim();
                break;
                case 't':
                    cmd.timings = cc;
                break;
                case 'l':
                    cmd.end = cc[0] ? true : false;
                    cmd.end_time = cc[0];
                break;
                case 's':
                    cmd.sentence = cc.join(' ');
                    //console.log(cc)
                break;
                case 'u':
                    cmd.sentence = cc.join(' ');
                break;
                case 'p':
                    cmd.typecode = Parser.parse_number(cc[0]);
                break;
            }
            commands.push(cmd);
        }
        
        return { headers,commands };
    }

    static is_ruby(sentence){
        let a = Parser.parse_ruby_syntax(sentence);
        return !!a.map(e => e[1]).join('');
    }
    
    // 슬래시 없이 자동 음절 구분 기능에 의존하는 경우
    static split_sentence(txt){
        let m = {
            CUT:0,
            MERGE:1
        }
        let str = '';
        let alphabet = true;
        let is_escape = false;
        let connect = false;
        let result = [];
        for(let i = 0;i < txt.length;i++){
            let chr = txt[i];
            if(is_escape){
                is_escape = false;
                str += chr;
            }else if(chr == ESCAPE){
                is_escape = true;
            }else if(chr == CONNECT_SYLLABLES){
                connect = true;
            }else if(chr.match(SPACE_REGEX)){
                if(str) result.push(str);
                result.push(chr);
                str = '';
            //}else if(chr.match(this.ALPHABET_REGEX)){
            }else if(ALPHABETS.indexOf(chr) >= 0){
                alphabet = true;
                str += chr;
            }else if(chr == SPLIT_ALPHABET && alphabet){
                result.push(str); str = '';
            }else if(chr == '(' || chr == '['){
                //if(alphabet || txt[i-(-1)].match(this.ALPHABET_REGEX)) str += chr;
                if(alphabet || ALPHABETS.indexOf(txt[i-(-1)]) >= 0) str += chr;
                else result.push(chr);
            }else if(chr == ')' || chr == ']'){
                if(alphabet) str += chr;
                else result[result.length-1] += chr;
            }else if(RUBY_BLOCK[chr]){
                let close = RUBY_BLOCK[chr];
                while(chr = txt[i]){
                    if(alphabet) str += chr;
                    else result[result.length-1] += chr;
                    if(chr == close) break;
                    i++;
                }
            }else{
                alphabet = false;
                if(str){
                    result.push(str);
                    str = '';
                }
                if(SPECIAL_CHARS3.indexOf(result[result.length-1]) >= 0 || connect) result[result.length-1] += chr;
                else result.push(chr);
                connect = false;
            }
            //console.log('chr',chr,'/ i',i,'/ str',str,'/ alphabet',alphabet,'/ result',result);
        }
        if(str) result.push(str);

        /*let final = [];
        let connect = false;
        result.forEach(a => {
            if(a == CONNECT_SYLLABLES) return connect = true;
            if(connect) final[final.length-1] += a;
            else final.push(a);
            connect = false;
        });*/
        return result;
    }

    static *parse_sentence(sentence){
        sentence = sentence.replace(SPACE_REGEX,' '); // 띄어쓰기가 여러개 있던걸 한개로 변환
        let syllables;
        if(sentence.match(FORCE_SPLIT)){
            sentence = str_replace_all(sentence,SPECIAL_CHARS2,'')
            .replace(new RegExp(`${FORCE_SPLIT}+`,'g'),FORCE_SPLIT);
            syllables = sentence
            .split(FORCE_SPLIT)
            .map(a => a
            .split(SPACE_REGEX)
            .map((a,i) => i == 0 ? a : [' ',a])
            .flat()).flat();
        }else{
            syllables = Parser.split_sentence(sentence);
        }
    
        yield syllables; // 잘린 거
        yield syllables.join('');
    }

    static parse_number(num){
        if(typeof num == 'number') return num;
        else if(typeof num == 'string'){
            if(isNaN(Number(num))) return eval(num);
            else return Number(num);
        }else return 0;
    }

    static parse_timing(time){
        time = time.split(':');
        let timing = {};
        timing.start = Parser.parse_number(time[0]);
        if(time[1]) timing.end = Parser.parse_number(time[1]);
        else timing.end = null;

        return timing;
    }

    static parse_time(time,bpm = 120,ticks_per_beat = 960){
        if(typeof time == 'number'){
            return {
                ms:60000/bpm*(parseFloat(Parser.parse_number(time))/ticks_per_beat),
                stakato:false
            };
        }else if(typeof time == 'string'){
            var [ tick,ms ] = time.split(':');
            var parsed = {
                stakato:tick.startsWith('*')
            };
            if(parsed.stakato){
                let tick2 = tick.split('');
                tick2.shift();
                tick = tick2.join('');
            }
            var beat = parseFloat(Parser.parse_number(tick))/ticks_per_beat;
            parsed.ms = 60000/bpm*beat;
            if(ms) parsed.ms += parseFloat(Parser.parse_number(ms));
            return parsed;
        }else return {
            ms:0,
            stakato:false
        };
    }

    static stringify_ruby_syntax(blocks){
        let line_str = '';
        for(let el of blocks){
            if(el[1]) line_str += `[${el[0]}]<${el[1]}>`;
            else line_str += el[0];
        }

        return line_str;
    }

    static parse_ruby_syntax(text){
        //this.status = [];
        let blocks = [];
        let status = {
            body:'',
            ruby:'',
            body_block_closed:false
        };
        let data = {
            body:'',
            ruby:''
        };
        for(let i in text){
            let chr = text[i];
            if(BODY_BLOCK[chr]){
                if(status.body) throw new SyntaxError(`Already opened the body block at position ${i} (character: '${chr}')`);
                if(status.ruby) throw new SyntaxError(`Already opened the ruby block at position ${i} (character: '${chr}')`);
                status.body = chr;
                blocks.push([data.body,data.ruby]);
                data.body = '';
                data.ruby = '';
            }else if(chr == BODY_BLOCK[status.body]){
                status.body = '';
                status.body_block_closed = true;
            }else if(RUBY_BLOCK[chr]){
                if(status.ruby) throw new SyntaxError(`Already opened the ruby block at position ${i} (character: '${chr}')`);
                if(status.body) throw new SyntaxError(`Already opened the body block at position ${i} (character: '${chr}')`);
                if(i == 0) throw new SyntaxError(`Invalid syntax at position ${i} (character: '${chr}')`);
                if(!status.body_block_closed){
                    let str = data.body.slice(0,data.body.length-1);
                    data.body = data.body[data.body.length-1];
                    blocks.push([str,'']);
                }
                status.body_block_closed = false;
                status.ruby = chr;
            }else if(status.body_block_closed){
                throw new SyntaxError(`Invalid syntax at position ${i} (character: '${chr}')`);
            }else if(chr == RUBY_BLOCK[status.ruby]){
                status.ruby = '';
                blocks.push([data.body,data.ruby]);
                data.body = '';
                data.ruby = '';
            }else{
                if(status.ruby){
                    data.ruby += chr;
                }else{
                    data.body += chr;
                }
            }
            //this.status.push({ chr,status:{...status},data:{...data} });
        }
        if(data.body) blocks.push([data.body,data.ruby]);

        return blocks.filter(a => a[0]);
    }
}