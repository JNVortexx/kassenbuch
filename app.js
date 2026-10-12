(function(){
  "use strict";

  var STORE = "kassenbuch.v1";
  var MONTHS = ["Januar","Februar","März","April","Mai","Juni","Juli","August",
                "September","Oktober","November","Dezember"];
  var MSHORT = ["J","F","M","A","M","J","J","A","S","O","N","D"];
  var eur  = new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"});
  var eur0 = new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR",maximumFractionDigits:0});

  var DEFAULT_CATS = {
    expense:[["gym","Gym"],["sport","Sport"],["essen","Essen"],["abos","Abos"],
      ["spass","Spaß"],["geschenke","Geschenke"],["transport","Transport"],
      ["wohnen","Wohnen & Fixkosten"],["shopping","Shopping"],
      ["content","Content & Business"],["gesundheit","Gesundheit"],["sonstiges","Sonstiges"]],
    income:[["einkommen","Einkommen"],["sonder","Sondereinkommen"],
      ["erstattung","Erstattung"],["sonstiges_in","Sonstiges"]]
  };
  function defaultCats(){
    var out={expense:[],income:[]};
    ["expense","income"].forEach(function(k){
      DEFAULT_CATS[k].forEach(function(c){ out[k].push({key:c[0],label:c[1]}); });
    });
    return out;
  }

  var today = new Date();
  var state = {
    cursor: ym(today),
    entries: [],
    months: {},
    cats: defaultCats(),
    kind: "expense",
    editing: null
  };

  /* ---------- Helfer ---------- */
  function pad(n){ return String(n).padStart(2,"0"); }
  function ym(d){ return d.getFullYear()+"-"+pad(d.getMonth()+1); }
  function shiftMonth(key,delta){
    var p=key.split("-"); return ym(new Date(+p[0], +p[1]-1+delta, 1));
  }
  function monthTitle(key){
    var p=key.split("-"); return MONTHS[+p[1]-1]+" <em>"+p[0]+"</em>";
  }
  function el(id){ return document.getElementById(id); }
  function esc(s){
    return String(s).replace(/[&<>"]/g,function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c];
    });
  }
  function uid(){ return Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,8); }
  function activeCats(kind){
    return (state.cats[kind]||[]).filter(function(c){ return !c.archived; });
  }
  function catName(kind,key){
    var l=(state.cats&&state.cats[kind])||[],i;
    for(i=0;i<l.length;i++) if(l[i].key===key) return l[i].label;
    var d=DEFAULT_CATS[kind]||[];
    for(i=0;i<d.length;i++) if(d[i][0]===key) return d[i][1];
    return key;
  }
  function slugify(label){
    var b=label.toLowerCase().replace(/ä/g,"ae").replace(/ö/g,"oe")
      .replace(/ü/g,"ue").replace(/ß/g,"ss")
      .replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");
    return (b||"kategorie").slice(0,40);
  }
  function freeKey(kind,label){
    var base=slugify(label), key=base, n=2, taken={};
    ["expense","income"].forEach(function(k){
      (state.cats[k]||[]).forEach(function(c){ taken[c.key]=true; });
    });
    while(taken[key]){ key=base+"_"+n; n++; }
    return key;
  }
  function usageCount(key){
    return state.entries.filter(function(e){ return e.category===key; }).length;
  }

  /* ---------- Speicher ---------- */
  function load(){
    try{
      var raw=localStorage.getItem(STORE);
      if(!raw) return false;
      var d=JSON.parse(raw);
      state.entries = Array.isArray(d.entries)?d.entries:[];
      state.months  = d.months||{};
      if(d.cats && Array.isArray(d.cats.expense)) state.cats=d.cats;
      return true;
    }catch(e){ return false; }
  }
  function save(){
    try{
      localStorage.setItem(STORE, JSON.stringify({
        version:1, entries:state.entries, months:state.months, cats:state.cats
      }));
      return true;
    }catch(e){
      hint("Konnte nicht gespeichert werden – ist der Speicher voll?");
      return false;
    }
  }

  /* ---------- Rechnen ---------- */
  function monthEntries(key){
    return state.entries.filter(function(e){ return e.month===key; })
      .sort(function(a,b){ return a.date===b.date ? (b.ts||0)-(a.ts||0) : (a.date<b.date?1:-1); });
  }
  function totals(list){
    var t={income:0,expense:0};
    list.forEach(function(e){ t[e.kind]+=e.amount; });
    return t;
  }
  function carryOver(key){
    var sum=0;
    state.entries.forEach(function(e){
      if(e.month<key) sum += (e.kind==="income"? e.amount : -e.amount);
    });
    return Math.round(sum*100)/100;
  }
  function firstMonth(){
    var m=null;
    state.entries.forEach(function(e){ if(m===null||e.month<m) m=e.month; });
    return m;
  }

  /* ---------- Zeichnen ---------- */
  function render(){
    var key=state.cursor;
    el("curMonth").innerHTML=monthTitle(key);

    var list=monthEntries(key), t=totals(list), rest=t.income-t.expense;
    var carry=carryOver(key), first=firstMonth();
    var hasPast = first!==null && first<key;
    var stand=Math.round((carry+rest)*100)/100;

    var r=el("sumRest");
    r.textContent=eur.format(stand);
    r.className="big num "+(stand<0?"neg":"pos");
    el("metaRest").textContent=(rest<0?"−":"+")+eur.format(Math.abs(rest))+" in diesem Monat";
    el("sumCarry").textContent=hasPast?eur.format(carry):"–";
    el("sumIn").textContent=eur.format(t.income);
    el("sumOut").textContent=eur.format(t.expense);

    renderBanner();
    renderLedger(list,hasPast,carry,key);
    renderCats(list,t);
    renderYear();
    el("closed").checked=!!state.months[key];
    el("foot").textContent="Gespeichert auf diesem Gerät. Über das Menü oben rechts sicherst du die Daten.";
  }

  /* Ab dem 5. daran erinnern, dass der Vormonat noch offen ist. */
  function renderBanner(){
    var box=el("banner"), now=new Date();
    var last=shiftMonth(ym(now),-1);
    if(now.getDate()>=5 && !state.months[last]){
      box.innerHTML='<button type="button" class="banner" data-goto="'+last+'">'+
        '<b>'+MONTHS[+last.split("-")[1]-1]+' ist noch offen.</b>'+
        '<span>Trag nach, was fehlt, und hak den Monat dann ab.</span></button>';
    } else {
      box.innerHTML="";
    }
  }

  function renderLedger(list,hasPast,carry,key){
    var p=el("ledgerPanel");
    if(!list.length && !hasPast){
      p.innerHTML='<p class="empty">Noch keine Buchung. Tipp unten auf „Neue Buchung".</p>';
      return;
    }
    var html='<div class="rows">';
    if(hasPast){
      var prev=MONTHS[+shiftMonth(key,-1).split("-")[1]-1];
      html+='<div class="row carryrow"><span class="d"></span>'+
        '<span class="c">Übertrag</span>'+
        '<span class="a num '+(carry<0?"neg":"pos")+'">'+(carry<0?"−":"+")+" "+eur.format(Math.abs(carry))+'</span>'+
        '<span class="n">Bestand Ende '+prev+'</span></div>';
    }
    if(!list.length){
      html+='<p class="empty">Noch keine Buchung in diesem Monat.</p>';
    }
    list.forEach(function(e){
      var day=e.date.slice(8)+"."+e.date.slice(5,7)+".";
      html+='<button type="button" class="row" data-id="'+esc(e.id)+'">'+
        '<span class="d num">'+day+'</span>'+
        '<span class="c">'+esc(catName(e.kind,e.category))+'</span>'+
        '<span class="a num '+(e.kind==="income"?"pos":"")+'">'+
          (e.kind==="income"?"+":"−")+" "+eur.format(e.amount)+'</span>'+
        (e.note?'<span class="n">'+esc(e.note)+'</span>':'')+
        '</button>';
    });
    html+='</div>';
    p.innerHTML=html;
  }

  function renderCats(list,t){
    var p=el("catsPanel");
    if(!list.length){ p.innerHTML='<p class="empty">Für diesen Monat ist noch nichts erfasst.</p>'; return; }
    var by={};
    list.forEach(function(e){
      var k=e.kind+"|"+e.category;
      by[k]=by[k]||{kind:e.kind,cat:e.category,sum:0};
      by[k].sum+=e.amount;
    });
    var rows=Object.keys(by).map(function(k){ return by[k]; }).sort(function(a,b){
      if(a.kind!==b.kind) return a.kind==="expense"?-1:1;
      return b.sum-a.sum;
    });
    var maxE=Math.max(t.expense,1), maxI=Math.max(t.income,1);
    p.innerHTML='<div class="cats">'+rows.map(function(r){
      var pct=Math.max(2,Math.round(r.sum/(r.kind==="expense"?maxE:maxI)*100));
      return '<div class="cat '+(r.kind==="income"?"income":"")+'">'+
        '<span class="n">'+esc(catName(r.kind,r.cat))+'</span>'+
        '<span class="a">'+(r.kind==="income"?"+":"")+eur.format(r.sum)+'</span>'+
        '<span class="bar"><i style="width:'+pct+'%"></i></span></div>';
    }).join("")+'</div>';
  }

  function renderYear(){
    var year=+state.cursor.split("-")[0];
    el("yearLabel").textContent=year;
    var per=[],max=1,i;
    for(i=0;i<12;i++){
      var key=year+"-"+pad(i+1);
      var t=totals(state.entries.filter(function(e){ return e.month===key; }));
      per.push({key:key,t:t});
      max=Math.max(max,t.income,t.expense);
    }
    el("year").innerHTML=per.map(function(m,idx){
      var hi=Math.round(m.t.income/max*70), he=Math.round(m.t.expense/max*70);
      var has=m.t.income>0||m.t.expense>0;
      return '<button type="button" class="ycell" data-m="'+m.key+'" aria-current="'+(m.key===state.cursor)+'" '+
        'title="'+MONTHS[idx]+": "+eur0.format(m.t.income)+" ein, "+eur0.format(m.t.expense)+' aus">'+
        '<span class="bars">'+
          '<i class="bin" style="height:'+(m.t.income>0?Math.max(hi,2):0)+'px"></i>'+
          '<i class="bex" style="height:'+(m.t.expense>0?Math.max(he,2):0)+'px"></i>'+
        '</span><span class="m">'+MSHORT[idx]+'</span>'+
        '<span class="dot '+(state.months[m.key]?"":"off")+'"'+(has?"":' style="opacity:.25"')+'></span></button>';
    }).join("");
  }

  /* ---------- Buchungs-Sheet ---------- */
  var sheet=el("entrySheet");

  function fillCats(){
    var sel=el("cat"), keep=sel.value, list=activeCats(state.kind);
    sel.innerHTML=list.length
      ? list.map(function(c){ return '<option value="'+esc(c.key)+'">'+esc(c.label)+'</option>'; }).join("")
      : '<option value="">– keine Kategorie –</option>';
    for(var i=0;i<list.length;i++) if(list[i].key===keep){ sel.value=keep; break; }
    renderCatAdmin();
  }
  function setKind(k){
    state.kind=k;
    el("kExp").setAttribute("aria-pressed",String(k==="expense"));
    el("kInc").setAttribute("aria-pressed",String(k==="income"));
    fillCats();
  }
  function defaultDate(){
    if(state.cursor===ym(today)){
      return today.getFullYear()+"-"+pad(today.getMonth()+1)+"-"+pad(today.getDate());
    }
    var p=state.cursor.split("-");
    return state.cursor+"-"+pad(new Date(+p[0],+p[1],0).getDate());
  }
  function hint(msg){
    var h=el("hint"); h.textContent=msg;
    if(msg) setTimeout(function(){ if(h.textContent===msg) h.textContent=""; },4000);
  }

  function openEntry(entry){
    state.editing = entry || null;
    el("entryTitle").textContent = entry ? "Buchung" : "Neue Buchung";
    el("entryDelete").hidden = !entry;
    el("catAdmin").hidden = true;
    el("catToggle").textContent = "Verwalten";
    el("catToggle").setAttribute("aria-expanded","false");
    hint("");
    setKind(entry ? entry.kind : "expense");
    el("amt").value  = entry ? entry.amount.toFixed(2).replace(".",",") : "";
    el("note").value = entry ? (entry.note||"") : "";
    el("date").value = entry ? entry.date : defaultDate();
    if(entry) el("cat").value = entry.category;
    sheet.showModal();
    if(!entry) setTimeout(function(){ el("amt").focus(); },60);
  }

  el("addBtn").addEventListener("click",function(){ openEntry(null); });
  el("entryCancel").addEventListener("click",function(){ sheet.close(); });
  el("kExp").addEventListener("click",function(){ setKind("expense"); });
  el("kInc").addEventListener("click",function(){ setKind("income"); });

  el("entryForm").addEventListener("submit",function(ev){
    var raw=el("amt").value.trim().replace(/\./g,"").replace(",",".");
    var amount=parseFloat(raw);
    if(!isFinite(amount)||amount<=0){ ev.preventDefault(); hint("Betrag eingeben, z. B. 24,90"); el("amt").focus(); return; }
    var cat=el("cat").value;
    if(!cat){ ev.preventDefault(); hint("Erst eine Kategorie anlegen."); return; }
    var date=el("date").value||defaultDate();
    var data={
      month:date.slice(0,7), date:date, kind:state.kind, category:cat,
      amount:Math.round(amount*100)/100, note:el("note").value.trim().slice(0,140)
    };
    if(state.editing){
      var e=state.editing;
      Object.keys(data).forEach(function(k){ e[k]=data[k]; });
    } else {
      data.id=uid(); data.ts=Date.now();
      state.entries.push(data);
    }
    state.cursor=data.month;
    state.editing=null;
    save(); render();
  });

  el("entryDelete").addEventListener("click",function(){
    if(!state.editing) return;
    var id=state.editing.id;
    state.entries=state.entries.filter(function(x){ return x.id!==id; });
    state.editing=null;
    save(); render(); sheet.close();
  });

  /* ---------- Kategorien verwalten ---------- */
  function renderCatAdmin(){
    var box=el("catAdmin");
    if(box.hidden) return;
    var all=state.cats[state.kind]||[];
    var live=all.filter(function(c){ return !c.archived; });
    var arch=all.filter(function(c){ return c.archived; });
    var html='<p class="note">'+(state.kind==="expense"?"Ausgaben-Kategorien":"Einnahme-Kategorien")+'</p>';
    html += live.length
      ? '<ul>'+live.map(function(c){
          var n=usageCount(c.key);
          return '<li><span class="g">'+esc(c.label)+'</span>'+(n?'<span class="u">'+n+'×</span>':'')+
            '<button type="button" data-rm="'+esc(c.key)+'" aria-label="'+esc(c.label)+' entfernen">×</button></li>';
        }).join("")+'</ul>'
      : '<p class="note">Keine aktive Kategorie. Leg unten eine an.</p>';
    html+='<div class="addrow"><input type="text" id="newCat" placeholder="Neue Kategorie" maxlength="32" autocomplete="off">'+
      '<button type="button" id="addCat">Anlegen</button></div>';
    if(arch.length){
      html+='<h3>Entfernt</h3><ul>'+arch.map(function(c){
        var n=usageCount(c.key);
        return '<li class="arch"><span class="g">'+esc(c.label)+'</span>'+(n?'<span class="u">'+n+'×</span>':'')+
          '<button type="button" data-back="'+esc(c.key)+'" aria-label="'+esc(c.label)+' zurückholen">&#8634;</button></li>';
      }).join("")+'</ul><p class="note">Buchungen in diesen Kategorien bleiben erhalten.</p>';
    }
    box.innerHTML=html;
  }

  el("catToggle").addEventListener("click",function(){
    var box=el("catAdmin"), open=box.hidden;
    box.hidden=!open;
    this.setAttribute("aria-expanded",String(open));
    this.textContent=open?"Fertig":"Verwalten";
    renderCatAdmin();
  });

  function addCat(){
    var f=el("newCat"); if(!f) return;
    var label=(f.value||"").trim().replace(/\s+/g," ").slice(0,32);
    if(!label){ f.focus(); return; }
    var dup=(state.cats[state.kind]||[]).filter(function(c){
      return c.label.toLowerCase()===label.toLowerCase();
    })[0];
    var key;
    if(dup){
      if(!dup.archived){ hint('"'+label+'" gibt es schon.'); f.value=""; return; }
      delete dup.archived; key=dup.key;
    } else {
      key=freeKey(state.kind,label);
      state.cats[state.kind].push({key:key,label:label});
    }
    f.value="";
    save(); fillCats(); el("cat").value=key; render();
    hint('"'+label+'" angelegt.');
  }

  el("catAdmin").addEventListener("click",function(ev){
    if(ev.target.closest("#addCat")){ addCat(); return; }
    var rm=ev.target.closest("[data-rm]");
    if(rm){
      var key=rm.getAttribute("data-rm"), list=state.cats[state.kind], idx=-1;
      for(var i=0;i<list.length;i++) if(list[i].key===key){ idx=i; break; }
      if(idx<0) return;
      var label=list[idx].label, used=usageCount(key);
      if(used){ list[idx].archived=true; hint('"'+label+'" entfernt – die '+used+' Buchungen bleiben.'); }
      else { list.splice(idx,1); hint('"'+label+'" gelöscht.'); }
      save(); fillCats(); render(); return;
    }
    var back=ev.target.closest("[data-back]");
    if(back){
      var bk=back.getAttribute("data-back"), l2=state.cats[state.kind];
      for(var j=0;j<l2.length;j++) if(l2[j].key===bk){ delete l2[j].archived; break; }
      save(); fillCats(); render();
    }
  });
  el("catAdmin").addEventListener("keydown",function(ev){
    if(ev.key==="Enter" && ev.target.id==="newCat"){ ev.preventDefault(); addCat(); }
  });

  /* ---------- Navigation ---------- */
  el("prev").addEventListener("click",function(){ state.cursor=shiftMonth(state.cursor,-1); render(); });
  el("next").addEventListener("click",function(){ state.cursor=shiftMonth(state.cursor,1); render(); });
  el("banner").addEventListener("click",function(ev){
    var b=ev.target.closest("[data-goto]"); if(!b) return;
    state.cursor=b.getAttribute("data-goto");
    render();
    window.scrollTo({top:0,behavior:"smooth"});
  });
  el("year").addEventListener("click",function(ev){
    var b=ev.target.closest("[data-m]"); if(!b) return;
    state.cursor=b.getAttribute("data-m"); render();
  });
  el("ledgerPanel").addEventListener("click",function(ev){
    var b=ev.target.closest("[data-id]"); if(!b) return;
    var id=b.getAttribute("data-id");
    var e=state.entries.filter(function(x){ return x.id===id; })[0];
    if(e) openEntry(e);
  });
  el("closed").addEventListener("change",function(ev){
    if(ev.target.checked) state.months[state.cursor]=true;
    else delete state.months[state.cursor];
    save(); render();
  });

  /* ---------- Menü, Sichern, Einlesen ---------- */
  var menu=el("menuSheet");
  el("menuBtn").addEventListener("click",function(){
    var n=state.entries.length;
    el("stats").textContent = n
      ? n+(n===1?" Buchung":" Buchungen")+" seit "+MONTHS[+firstMonth().split("-")[1]-1]+" "+firstMonth().split("-")[0]+"."
      : "Noch keine Buchung erfasst.";
    menu.showModal();
  });
  el("menuClose").addEventListener("click",function(){ menu.close(); });

  el("exportBtn").addEventListener("click",function(){
    var blob=new Blob([JSON.stringify({
      version:1, exported:new Date().toISOString(),
      entries:state.entries, months:state.months, cats:state.cats
    },null,2)],{type:"application/json"});
    var url=URL.createObjectURL(blob);
    var a=document.createElement("a");
    a.href=url; a.download="kassenbuch-"+ym(new Date())+".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); },2000);
  });

  el("importBtn").addEventListener("click",function(){ el("importFile").click(); });
  el("importFile").addEventListener("change",function(ev){
    var file=ev.target.files && ev.target.files[0];
    if(!file) return;
    file.text().then(function(txt){
      var d=JSON.parse(txt);
      if(!Array.isArray(d.entries)) throw new Error("keine Buchungen in der Datei");
      applyImport(d);
      menu.close();
    }).catch(function(err){
      alert("Datei konnte nicht gelesen werden: "+(err.message||err));
    });
    ev.target.value="";
  });

  function applyImport(d){
    var known={};
    state.entries.forEach(function(e){ known[e.id]=true; });
    var added=0;
    d.entries.forEach(function(e){
      if(!e || !e.id || known[e.id]) return;
      state.entries.push({
        id:e.id, month:e.month, date:e.date, kind:e.kind, category:e.category,
        amount:+e.amount||0, note:e.note||"", ts:e.ts||0
      });
      added++;
    });
    if(d.months) Object.keys(d.months).forEach(function(k){ if(d.months[k]) state.months[k]=true; });
    if(d.cats && Array.isArray(d.cats.expense)) state.cats=d.cats;
    save(); render();
    alert(added ? added+(added===1?" Buchung":" Buchungen")+" eingelesen." : "Alles war schon vorhanden.");
  }

  /* Einmal-Import über #import=... – bleibt im Gerät, wird nie an einen Server geschickt. */
  function importFromHash(){
    var m=/[#&]import=([A-Za-z0-9\-_]+)/.exec(location.hash||"");
    if(!m) return;
    try{
      var b64=m[1].replace(/-/g,"+").replace(/_/g,"/");
      var bin=atob(b64);
      var bytes=new Uint8Array(bin.length);
      for(var i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
      var d=JSON.parse(new TextDecoder().decode(bytes));
      history.replaceState(null,"",location.pathname+location.search);
      if(!Array.isArray(d.entries)) return;
      if(confirm("Sicherung mit "+d.entries.length+" Buchungen einlesen?")) applyImport(d);
    }catch(e){
      history.replaceState(null,"",location.pathname+location.search);
    }
  }

  /* ---------- Start ---------- */
  load();
  importFromHash();
  render();

  if("serviceWorker" in navigator){
    window.addEventListener("load",function(){
      navigator.serviceWorker.register("sw.js").catch(function(){});
    });
  }
})();
