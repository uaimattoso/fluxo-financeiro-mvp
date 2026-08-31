import { useEffect, useRef, useState } from 'react';
import { recognize } from 'tesseract.js';
import { UploadCloud, Clipboard, Sparkles, FileImage, X, Check, AlertTriangle, ChevronDown, RotateCcw, ShieldCheck, Music2, Flame, Snowflake, CircleGauge } from 'lucide-react';

type Kind = 'Banda' | 'Gelo' | 'Gás' | 'Carvão';
type Form = { kind:Kind; supplier:string; bandName:string; amount:string; payment:string; referenceDays:string; competence:string; category:string; description:string; pix:string };
const empty:Form={kind:'Banda',supplier:'',bandName:'',amount:'',payment:'',referenceDays:'',competence:'',category:'',description:'',pix:''};
const PARSER_VERSION=11;
const dateRx=/\b([0-3]?\d[\/.-][01]?\d(?:[\/.-](?:20)?\d{2})?)\b/g;
const normalize=(v:string,year:string)=>{const p=v.replace(/[.-]/g,'/').split('/');if(p.length===2)p.push(year);if(p[2]?.length===2)p[2]='20'+p[2];return p.map((x,i)=>i<2?x.padStart(2,'0'):x).join('/')};
function parse(raw:string){
 const text=raw.replace(/\r/g,''),low=text.toLocaleLowerCase('pt-BR'),warnings:string[]=[];
 let detected:Kind|null=/carv[aã]o/.test(low)?'Carvão':/\bg[aá]s\b/.test(low)?'Gás':/gelo/.test(low)?'Gelo':/banda|grupo|show|cach[eê]/.test(low)?'Banda':null;
 if(!detected){detected='Banda';warnings.push('Serviço não identificado — selecione o tipo correto.');}
 const kind:Kind=detected; const year=(text.match(/\b20\d{2}\b/)||[String(new Date().getFullYear())])[0];
 const cleanLine=(line:string)=>line.replace(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g,'').replace(/[✓✔]{1,2}/g,'').replace(/\s{2,}/g,' ').trim();
 const lines=text.split('\n').map(cleanLine).filter(Boolean);
 const valueLine=lines.find(l=>/\bvalor\b|\btotal\b|\bpag(?:ar|amento)\b|(?:r\s*)?\$/i.test(l));
 const visualNumber=valueLine?.match(/(?:val[o0]r|total|(?:r\s*)?[\$s5])\s*[\s:;.,-]*[\$s5]?\s*([0-9oObBiIlLsS.,]+)/i)?.[1]
   ?.replace(/[oO]/g,'0').replace(/[bB]/g,'8').replace(/[iIlL]/g,'1').replace(/[sS]/g,'5');
 const explicitValue=visualNumber
   ? /^\d{1,3}(?:[,]\d{3})+[,]\d{1,2}$/.test(visualNumber) ? (()=>{const parts=visualNumber.split(',');const cents=parts.pop()!.padEnd(2,'0');return parts.join('.')+','+cents})()
   : /^\d{1,3}(?:[.]\d{3})+[,]\d{1,2}$/.test(visualNumber) ? (/,\d$/.test(visualNumber)?visualNumber+'0':visualNumber)
   : /^\d{1,3}(?:[,]\d{3})+[.]\d{1,2}$/.test(visualNumber) ? visualNumber.replace(/,/g,'').replace('.',',')
   : /^\d{1,3}(?:[.]\d{3})+$/.test(visualNumber) ? visualNumber+',00'
   : /^\d{1,3}(?:[,]\d{3})+$/.test(visualNumber) ? visualNumber.replace(/,/g,'.')+',00'
   : /^\d+[,]\d{1,2}$/.test(visualNumber) ? (/,\d$/.test(visualNumber)?visualNumber+'0':visualNumber)
   : /^\d+$/.test(visualNumber) ? visualNumber+',00' : ''
   : '';
 const moneyWithCents=[...text.matchAll(/(?:(?:R\s*)?\$\s*)?((?:\d{1,3}(?:\.\d{3})*|\d+),\d{1,2})(?!\d)/gi)].map(m=>/,\d$/.test(m[1])?m[1]+'0':m[1]);
 const integerValue=valueLine?.replace(dateRx,'').match(/(?:(?:R\s*)?\$\s*)?\b(\d{1,3}(?:\.\d{3})*|\d{2,6})\b/i)?.[1];
 const amounts=explicitValue?[explicitValue]:moneyWithCents.length?moneyWithCents:integerValue?[integerValue+',00']:[];
 const paymentLine=lines.find(l=>/pagamento|pagar|vencimento|venc\.?/i.test(l)); const pay=paymentLine?.match(dateRx)?.[0]||'';
 const refLines=lines.filter(l=>/refer|evento|dias?|datas?/i.test(l)&&!/pagamento|venc/i.test(l));
 const refs=[...new Set(refLines.flatMap(l=>l.match(dateRx)||[]).map(d=>normalize(d,year)))];
 const time=(d:string)=>{const [a,m,y]=d.split('/').map(Number);return +new Date(y,m-1,a)}; const competence=refs.sort((a,b)=>time(a)-time(b)).at(-1)||'';
 const pixLine=lines.find(l=>/pix|chave/i.test(l)); const pix=pixLine?.replace(/^.*?(?:pix|chave)\s*:?-?\s*/i,'').trim()||'';
 const supplierLine=lines.find(l=>/favorecid|fornecedor|benefici[aá]rio|recebedor|titular/i.test(l)); const supplier=cleanLine(supplierLine?.replace(/^.*?(?:favorecid[oa]?|fornecedor|benefici[aá]rio|recebedor|titular)\s*:?-?\s*/i,'')||'');
 const bandLine=lines.find(l=>/banda\s*:|grupo\s*:/i.test(l)); const bandName=bandLine?.replace(/^.*?(?:banda|grupo)\s*:?-?\s*/i,'').trim()||'';
 if(!amounts.length)warnings.push('Valor não encontrado.'); if(!pay)warnings.push('Data de pagamento não encontrada.'); if(!supplier)warnings.push('Favorecido não identificado com segurança.'); if(kind==='Banda'&&!bandName)warnings.push('Nome da banda não identificado.');
 if(!refs.length)warnings.push(kind==='Banda'?'Data do evento não encontrada.':'Dias referentes não encontrados; revise a competência.');
 const form:Form={kind,supplier,bandName,amount:amounts[0]||'',payment:pay?normalize(pay,year):'',referenceDays:refs.join(', '),competence,category:kind==='Banda'?'Couvert Artístico':kind,description:kind==='Banda'&&competence?`Data do evento: ${competence} Banda: ${bandName}`:'',pix};
 return {form,warnings};
}
function Field({label,value,onChange,wide=false}:{label:string;value:string;onChange:(v:string)=>void;wide?:boolean}){return <label className={wide?'field wide':'field'}><span>{label}</span><input placeholder="Revisar" value={value} onChange={e=>onChange(e.target.value)}/></label>}

export function App(){
 const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState(''),[stage,setStage]=useState<'empty'|'loading'|'ready'|'done'>('empty');
 const [form,setForm]=useState<Form>(empty),[drag,setDrag]=useState(false),[warnings,setWarnings]=useState<string[]>([]),[progress,setProgress]=useState(0),[ocrText,setOcrText]=useState(''); const input=useRef<HTMLInputElement>(null); const recurring=form.kind!=='Banda';
 const load=async(f:File)=>{if(!f?.type.startsWith('image/'))return;setFile(f);setPreview(URL.createObjectURL(f));setStage('loading');setWarnings([]);setProgress(0);try{const r=await recognize(f,'por+eng',{logger:m=>{if(m.status==='recognizing text')setProgress(Math.round((m.progress||0)*100))}});setOcrText(r.data.text);const p=parse(r.data.text);setForm(p.form);setWarnings(p.warnings)}catch{setForm(empty);setWarnings(['Não foi possível ler esta imagem. Tente um print mais nítido.'])}finally{setStage('ready')}};
 useEffect(()=>{const paste=(e:ClipboardEvent)=>{const f=[...(e.clipboardData?.files||[])].find(x=>x.type.startsWith('image/'));if(f)load(f)};window.addEventListener('paste',paste);return()=>window.removeEventListener('paste',paste)},[]);
 useEffect(()=>{if(!ocrText||stage==='loading')return;const parsed=parse(ocrText);setForm(parsed.form);setWarnings(parsed.warnings)},[ocrText,stage,PARSER_VERSION]);
 const update=(k:keyof Form,v:string)=>setForm(x=>({...x,[k]:v})); const reset=()=>{setFile(null);setPreview('');setStage('empty');setForm(empty);setWarnings([]);setOcrText('');setProgress(0)};
 const choose=(kind:Kind)=>setForm(x=>({...x,kind,category:kind==='Banda'?'Couvert Artístico':kind,description:kind==='Banda'&&x.competence?`Data do evento: ${x.competence} Banda: ${x.bandName}`:''}));
 return <main><header><div className="brand"><div className="brandmark">FL</div><div><strong>Fluxo</strong><span>Assistente financeiro</span></div></div><div className="privacy"><ShieldCheck size={15}/> Leitura local · sem Conta Azul</div></header>
 <section className="intro"><div><p className="eyebrow">NOVA ORDEM DE PAGAMENTO</p><h1>Transforme um print em um<br/><em>lançamento pronto.</em></h1><p className="sub">Envie a ordem de pagamento. A leitura identifica apenas o que está no print e sinaliza o que precisa de revisão.</p></div><div className="progress"><span className="active">1</span><i/><span className={stage==='ready'||stage==='done'?'active':''}>2</span><i/><span className={stage==='done'?'active':''}>3</span><small>Enviar</small><small>Revisar</small><small>Confirmar</small></div></section>
 <section className="workspace"><div className="leftcol"><div className="sectionhead"><div><b>01</b><h2>Ordem de pagamento</h2></div>{file&&<button className="link" onClick={reset}><RotateCcw size={14}/> Trocar imagem</button>}</div>
 {stage==='empty'?<div className={'drop '+(drag?'drag':'')} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);load(e.dataTransfer.files[0])}} onClick={()=>input.current?.click()}><input ref={input} type="file" accept="image/*" hidden onChange={e=>e.target.files?.[0]&&load(e.target.files[0])}/><div className="uploadicon"><UploadCloud/></div><h3>Arraste o print para cá</h3><p>ou clique para escolher uma imagem</p><div className="paste"><Clipboard size={16}/> Cole com <kbd>Ctrl</kbd> + <kbd>V</kbd></div><small>PNG, JPG ou WEBP · até 10 MB</small></div>:<div className="previewbox"><div className="filebar"><span><FileImage size={17}/>{file?.name}</span><button onClick={reset}><X size={17}/></button></div><img src={preview}/>{stage==='loading'&&<div className="scanning"><span/><div><Sparkles size={18}/> Lendo o print... {progress}%</div></div>}</div>}
 <div className="rulebox"><div className="bulb"><Sparkles size={17}/></div><div><strong>Regras aplicadas</strong><p>Banda cria lançamento novo. Gelo, Gás e Carvão atualizam a recorrência aberta.</p></div></div></div>
 <div className={'rightcol '+(stage==='empty'||stage==='loading'?'muted':'')}><div className="sectionhead"><div><b>02</b><h2>Sugestão do lançamento</h2></div>{stage==='ready'&&<span className="confidence"><CircleGauge size={15}/> {warnings.length?'Revisão necessária':'Dados identificados'}</span>}</div>
 {(stage==='empty'||stage==='loading')?<div className="waiting"><Sparkles/><h3>{stage==='loading'?'Lendo seu print de verdade':'A sugestão aparecerá aqui'}</h3><p>{stage==='loading'?`Reconhecimento de texto: ${progress}%`:'Envie uma imagem para começar.'}</p></div>:<div className="suggestion"><div className="actionrow"><div><small>AÇÃO SUGERIDA</small><span className={recurring?'badge recurring':'badge new'}>{recurring?<RotateCcw/>:<Check/>}{recurring?'Atualizar recorrência em aberto':'Novo lançamento'}</span></div><label className="service"><small>SERVIÇO IDENTIFICADO</small><div className="selectwrap">{form.kind==='Banda'?<Music2/>:form.kind==='Gelo'?<Snowflake/>:<Flame/>}<select value={form.kind} onChange={e=>choose(e.target.value as Kind)}><option>Banda</option><option>Gelo</option><option>Gás</option><option>Carvão</option></select><ChevronDown/></div></label></div>
 <div className="divider"/><div className="formgrid"><Field label="Fornecedor / favorecido" value={form.supplier} onChange={v=>update('supplier',v)} wide/>{!recurring&&<Field label="Nome da banda" value={form.bandName} onChange={v=>{update('bandName',v);setForm(x=>({...x,description:x.competence?`Data do evento: ${x.competence} Banda: ${v}`:''}))}} wide/>}<Field label="Valor" value={form.amount} onChange={v=>update('amount',v)}/><Field label="Data de pagamento" value={form.payment} onChange={v=>update('payment',v)}/>{recurring&&<Field label="Dias referentes" value={form.referenceDays} onChange={v=>update('referenceDays',v)} wide/>}<Field label="Competência" value={form.competence} onChange={v=>update('competence',v)}/><Field label="Categoria" value={form.category} onChange={v=>update('category',v)}/><Field label="Descrição" value={form.description} onChange={v=>update('description',v)} wide/><Field label="Chave PIX" value={form.pix} onChange={v=>update('pix',v)} wide/></div>
 {warnings.map(w=><div className="notice" key={w}><AlertTriangle size={18}/><div><strong>Revisar</strong><p>{w}</p></div></div>)}<details className="ocr"><summary>Ver texto lido do print</summary><pre>{ocrText||'Nenhum texto reconhecido.'}</pre></details>
 {stage==='done'?<div className="success"><Check/> Sugestão confirmada.</div>:<button className="confirm" onClick={()=>setStage('done')}><Check size={18}/> Confirmar sugestão</button>}</div>}</div></section>
 <footer><span>FLUXO · MVP</span><p>Somente informações encontradas no print são sugeridas.</p></footer></main>;
}
