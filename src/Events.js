// private static 변수/함수
var __ = {};

module.exports = class Events{
    constructor(events){
        this._events = (events instanceof Events)
            ? events.get_all() : (events || {});
    }

    add(ms,name,data,unshift = false){
        ms = Math.round(ms);
        if(!this._events[ms]) this._events[ms] = [];
        if(unshift) this._events[ms].unshift({ name:name,data:data });
        else this._events[ms].push({ name:name,data:data });
    }
    
    getAll(){
        return this._events;
    }
}