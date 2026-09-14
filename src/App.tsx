import { useEffect, useRef, useState } from "react";
import { recognize } from "tesseract.js";
import {
  UploadCloud,
  Clipboard,
  Sparkles,
  FileImage,
  X,
  Check,
  AlertTriangle,
  ChevronDown,
  RotateCcw,
  ShieldCheck,
  Music2,
  Flame,
  Snowflake,
  CircleGauge,
  Link2,
  CloudUpload,
  Building2,
} from "lucide-react";

type Kind = "Banda" | "Gelo" | "Gás" | "Carvão" | "Rateio CRS";
type House =
  | "Bafo da Prainha"
  | "Capiau"
  | "Dois de Fevereiro"
  | "Casa Porto"
  | "Casa de Apoio CRS";
type Form = {
  kind: Kind;
  supplier: string;
  bandName: string;
  amount: string;
  payment: string;
  referenceDays: string;
  competence: string;
  category: string;
  description: string;
  pix: string;
};
type Option = { id: string; name: string };
type CpfLookup = { cpf: string; people: Option[]; loading: boolean; error: string };
type Catalogs = {
  accounts: Option[];
  categories: Option[];
  costCenters: Option[];
  people: Option[];
};
type Mappings = {
  accountId: string;
  categoryId: string;
  costCenterId: string;
  contactId: string;
};
type Restaurant = Exclude<House, "Casa de Apoio CRS">;
type CrsEntry = {
  type: "Receita" | "Despesa";
  party: string;
  amount: string;
  description: string;
};
type CrsCatalogs = { accounts: Option[]; categories: Option[]; clients: Option[]; suppliers: Option[] };
type CrsMappings = { accountId: string; receivableCategoryIds: Record<string,string>; payableCategoryId: string; supplierId: string; clientIds: Record<string,string> };
const blankCrsCatalogs: CrsCatalogs = {accounts:[],categories:[],clients:[],suppliers:[]};
const blankCrsMappings: CrsMappings = {accountId:"",receivableCategoryIds:{},payableCategoryId:"",supplierId:"",clientIds:{}};
const CRS_FIXED_ACCOUNT = '1.Banco Safra - Conta Corrente';
const CRS_CLIENT_NAMES: Record<Restaurant,string> = {
  'Bafo da Prainha':'BAFO DA PRAINHA',
  'Casa Porto':'CASA PORTO',
  'Capiau':'O TORRESMEIRO (Capiau)',
  'Dois de Fevereiro':'TASCARIA (2 de Fevereiro)',
};
const CRS_CATEGORY_NAMES: Record<Restaurant,string> = {
  'Bafo da Prainha':'Recebíveis - Bafo',
  'Casa Porto':'Recebíveis - Casa Porto',
  'Capiau':'Recebíveis - Capiau',
  'Dois de Fevereiro':'Recebíveis - Dois de Fevereiro',
};
const sameCaName=(left:string,right:string)=>left.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase()===right.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
const uniqueCaMatch=(items:Option[],name:string)=>{const hits=items.filter(item=>sameCaName(item.name,name));return hits.length===1?hits[0].id:'';};
const BRIDGES = {
  "Bafo da Prainha": "https://script.google.com/macros/s/AKfycbxw0xo23_7QDtbz-JOttoog4EN7_9nB7daPNGrw4Z5fywYGZBMqMYLEsYe5IdrVjek/exec",
  "Casa de Apoio CRS": "https://script.google.com/macros/s/AKfycbw7-WplZr-2N6pu76966H18o5DpyDNw2sR8No2ASCO9IdM8ZUXzMG_zg05M3VnV-Xh1/exec",
} as const;
type ConnectedHouse = keyof typeof BRIDGES;
const CONNECTED_HOUSES = Object.keys(BRIDGES) as ConnectedHouse[];
const hasBridge = (value: House): value is ConnectedHouse => value in BRIDGES;
const blankCatalogs: Catalogs = {
  accounts: [],
  categories: [],
  costCenters: [],
  people: [],
};
const blankMappings: Mappings = {
  accountId: "",
  categoryId: "",
  costCenterId: "",
  contactId: "",
};
const empty: Form = {
  kind: "Banda",
  supplier: "",
  bandName: "",
  amount: "",
  payment: "",
  referenceDays: "",
  competence: "",
  category: "",
  description: "",
  pix: "",
};
const PARSER_VERSION = 13;
const digits = (value: string) => value.replace(/\D/g, "");
function validCpf(value: string) {
  const cpf = digits(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (let size = 9; size <= 10; size++) {
    let sum = 0;
    for (let i = 0; i < size; i++) sum += Number(cpf[i]) * (size + 1 - i);
    if ((sum * 10) % 11 % 10 !== Number(cpf[size])) return false;
  }
  return true;
}
const nameKey = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
const HOUSES: House[] = [
  "Bafo da Prainha",
  "Capiau",
  "Dois de Fevereiro",
  "Casa Porto",
  "Casa de Apoio CRS",
];
const RESTAURANTS: Restaurant[] = [
  "Bafo da Prainha",
  "Casa Porto",
  "Capiau",
  "Dois de Fevereiro",
];
const CRS_ALLOCATION: Record<Restaurant, number> = {
  "Bafo da Prainha": 42,
  Capiau: 26,
  "Dois de Fevereiro": 12,
  "Casa Porto": 20,
};
const HOUSE_STORAGE_KEY = "fluxo:selected-house";
const dateRx = /\b([0-3]?\d[\/.-][01]?\d(?:[\/.-](?:20)?\d{2})?)\b/g;
const normalize = (v: string, year: string) => {
  const p = v.replace(/[.-]/g, "/").split("/");
  if (p.length === 2) p.push(year);
  if (p[2]?.length === 2) p[2] = "20" + p[2];
  return p.map((x, i) => (i < 2 ? x.padStart(2, "0") : x)).join("/");
};
function normalizeMoney(line: string) {
  const afterLabel = line
    .replace(/^.*?(?:val[o0]r|total)\s*[:;.,-]?\s*/i, "")
    .replace(/^(?:r\s*)?[\$s]\s*/i, "")
    .trim();
  const token = afterLabel
    .match(/[0-9oObBiIlLsS]+(?:[.,][0-9oObBiIlLsS]+)*/)?.[0]
    ?.replace(/[oO]/g, "0")
    .replace(/[bB]/g, "8")
    .replace(/[iIlL]/g, "1")
    .replace(/[sS]/g, "5");
  if (!token) return "";
  const groups = token.split(/[.,]/);
  let cents = "00",
    integer = "";
  if (groups.length === 1) integer = groups[0];
  else if (groups.at(-1)!.length <= 2) {
    cents = groups.pop()!.padEnd(2, "0");
    integer = groups.join("");
  } else {
    integer = groups.join("");
  }
  integer = integer.replace(/^0+(?=\d)/, "");
  if (!/^\d+$/.test(integer) || !/^\d{2}$/.test(cents)) return "";
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + cents;
}
function extractDocumentTotal(text: string) {
  const normalized = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  const patterns = [
    /(?:valor\s+do\s+documento|valor\s+cobrado|total\s+do\s+boleto|valor\s+total)[^\d]{0,35}([\d.]+,\d{2})/i,
    /R\s*\$\s*([\d.]+,\d{2})/i,
  ];
  for (const pattern of patterns) {
    const value = normalized.match(pattern)?.[1];
    if (value) return value;
  }
  return "";
}
const moneyToCents = (value: string) => {
  const normalized = value
    .replace(/\s|R\$/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  return Math.round((Number(normalized) || 0) * 100);
};
const centsToMoney = (value: number) =>
  (value / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
async function readPdf(file: File) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() })
    .promise;
  const pages: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const content = await (await pdf.getPage(n)).getTextContent();
    pages.push(
      content.items.map((item) => ("str" in item ? item.str : "")).join(" "),
    );
  }
  return pages.join("\n");
}
function parse(raw: string) {
  const text = raw.replace(/\r/g, ""),
    low = text.toLocaleLowerCase("pt-BR"),
    warnings: string[] = [];
  let detected: Kind | null =
    /benef[ií]cio cidadania|pagador\s+crs servico/i.test(low)
      ? "Rateio CRS"
      : /carv[aã]o/.test(low)
        ? "Carvão"
        : /\bg[aá]s\b/.test(low)
          ? "Gás"
          : /gelo/.test(low)
            ? "Gelo"
            : /banda|grupo|show|cach[eê]/.test(low)
              ? "Banda"
              : null;
  if (!detected) {
    detected = "Banda";
    warnings.push("Serviço não identificado — selecione o tipo correto.");
  }
  const kind: Kind = detected;
  const year = (text.match(/\b20\d{2}\b/) || [
    String(new Date().getFullYear()),
  ])[0];
  const cleanLine = (line: string) =>
    line
      .replace(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g, "")
      .replace(/[✓✔]{1,2}/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  const lines = text.split("\n").map(cleanLine).filter(Boolean);
  const valueLine = lines.find((l) => /\bval[o0]r\b|\btotal\b/i.test(l));
  const documentMoney = extractDocumentTotal(text);
  const amount =
    kind === "Rateio CRS"
      ? documentMoney
      : valueLine
        ? normalizeMoney(valueLine)
        : "";
  const paymentLine = lines.find((l) =>
    /pagamento|pagar|vencimento|venc\.?/i.test(l),
  );
  const pay = paymentLine?.match(dateRx)?.[0] || "";
  const refLines = lines.filter(
    (l) => /refer|evento|dias?|datas?/i.test(l) && !/pagamento|venc/i.test(l),
  );
  const refs = [
    ...new Set(
      refLines
        .flatMap((l) => l.match(dateRx) || [])
        .map((d) => normalize(d, year)),
    ),
  ];
  const time = (d: string) => {
    const [a, m, y] = d.split("/").map(Number);
    return +new Date(y, m - 1, a);
  };
  const competence = refs.sort((a, b) => time(a) - time(b)).at(-1) || "";
  const pixLine = lines.find((l) => /pix|chave/i.test(l));
  const pix = pixLine?.replace(/^.*?(?:pix|chave)\s*:?-?\s*/i, "").trim() || "";
  const supplierLine = lines.find((l) =>
    /favorecid|fornecedor|benefici[aá]rio|recebedor|titular/i.test(l),
  );
  let supplier = cleanLine(
    supplierLine?.replace(
      /^.*?(?:favorecid[oa]?|fornecedor|benefici[aá]rio|recebedor|titular)\s*:?-?\s*/i,
      "",
    ) || "",
  );
  if (kind === "Rateio CRS")
    supplier = (
      text.match(
        /SHALOM\s+SAUDE,?\s+GESTAO\s+E\s+ADMINISTRACAO\s+DE\s+BENEFICIOS\s+LTDA/i,
      )?.[0] || supplier
    ).toUpperCase();
  const bandLine = lines.find((l) => /banda\s*:|grupo\s*:/i.test(l));
  const bandName =
    bandLine?.replace(/^.*?(?:banda|grupo)\s*:?-?\s*/i, "").trim() || "";
  if (!amount) warnings.push("Valor não encontrado.");
  if (!pay && kind !== "Rateio CRS")
    warnings.push("Data de pagamento não encontrada.");
  if (!supplier) warnings.push("Favorecido não identificado com segurança.");
  if (kind === "Banda" && !bandName)
    warnings.push("Nome da banda não identificado.");
  if (!refs.length && kind !== "Rateio CRS")
    warnings.push(
      kind === "Banda"
        ? "Data do evento não encontrada."
        : "Dias referentes não encontrados; revise a competência.",
    );
  const crsDue =
    kind === "Rateio CRS"
      ? text.match(/Vencimento[\s\S]{0,260}?(\d{2}\/\d{2}\/20\d{2})/i)?.[1] ||
        pay
      : "";
  const reference =
    kind === "Rateio CRS"
      ? text.match(/Ref\.\s*(\d{2}\/20\d{2})/i)?.[1] || ""
      : "";
  const documentNumber =
    kind === "Rateio CRS"
      ? text.match(/\b\d{2}\/\d{2}\/20\d{2}\s+(\d{3,})\b/)?.[1] || ""
      : "";
  const crsCompetence = reference
    ? new Date(
        Number(reference.slice(3)),
        Number(reference.slice(0, 2)),
        0,
      ).toLocaleDateString("pt-BR")
    : "";
  const form: Form = {
    kind,
    supplier,
    bandName,
    amount,
    payment: crsDue ? normalize(crsDue, year) : pay ? normalize(pay, year) : "",
    referenceDays: reference || refs.join(", "),
    competence: kind === "Rateio CRS" ? crsCompetence : competence,
    category:
      kind === "Banda"
        ? "Couvert Artístico"
        : kind === "Rateio CRS"
          ? "Benefício Cidadania"
          : kind,
    description:
      kind === "Banda" && competence
        ? `Data do evento: ${competence} Banda: ${bandName}`
        : kind === "Rateio CRS"
          ? `Rateio Benefício Cidadania${reference ? " - Ref. " + reference : ""}${documentNumber ? " - Documento " + documentNumber : ""}`
          : "",
    pix,
  };
  return { form, warnings };
}
function Field({
  label,
  value,
  onChange,
  wide = false,
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  wide?: boolean;
  readOnly?: boolean;
}) {
  return (
    <label className={wide ? "field wide" : "field"}>
      <span>{label}</span>
      <input
        placeholder="Revisar"
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function MapSelect({
  label,
  value,
  items = [],
  onChange,
  optional = false,
}: {
  label: string;
  value: string;
  items?: Option[];
  onChange: (v: string) => void;
  optional?: boolean;
}) {
  return (
    <label className="mapfield">
      <span>{label}</span>
      {items.length ? (
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">
            {optional ? "Sem centro de custo" : "Selecione"}
          </option>
          {items.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            optional ? "Opcional — cole o ID" : "Cole o ID do Conta Azul"
          }
        />
      )}
    </label>
  );
}
function CrsReview({
  form,
  update,
  allocations,
  entries,
  totalCents,
  allocatedCents,
  balanced,
  done,
  catalogs,
  mappings,
  onMappings,
  busy,
  connected,
  onPrepare,
  error,
  results,
}: {
  form: Form;
  update: (key: keyof Form, value: string) => void;
  allocations: Record<Restaurant, string>;
  entries: CrsEntry[];
  totalCents: number;
  allocatedCents: number;
  balanced: boolean;
  done: boolean;
  catalogs: CrsCatalogs;
  mappings: CrsMappings;
  onMappings: (value: CrsMappings) => void;
  busy: boolean;
  connected: boolean;
  onPrepare: () => void;
  error: string;
  results: any[];
}) {
  return (
    <div className="suggestion crs-review">
      <div className="actionrow">
        <div>
          <small>FLUXO SUGERIDO</small>
          <span className="badge new">
            <Check /> 5 lançamentos na CRS
          </span>
        </div>
        <div className="crs-total">
          <small>TOTAL DO BOLETO</small>
          <strong>R$ {centsToMoney(totalCents)}</strong>
        </div>
      </div>
      <div className="divider" />
      <div className="formgrid">
        <Field
          label="Fornecedor da despesa"
          value={form.supplier}
          onChange={(v) => update("supplier", v)}
          wide
        />
        <Field
          label="Valor total"
          value={form.amount}
          onChange={(v) => update("amount", v)}
        />
        <Field
          label="Vencimento"
          value={form.payment}
          onChange={(v) => update("payment", v)}
        />
        <Field
          label="Competência"
          value={form.competence}
          onChange={(v) => update("competence", v)}
        />
        <Field
          label="Categoria"
          value={form.category}
          onChange={(v) => update("category", v)}
        />
        <Field
          label="Descrição da despesa"
          value={form.description}
          onChange={(v) => update("description", v)}
          wide
        />
      </div>
      <div className="allocation-head">
        <div>
          <h3>Rateio entre os restaurantes</h3>
          <p>Proporção fixa aplicada automaticamente ao total do boleto.</p>
        </div>
        <span className={balanced ? "validation ok" : "validation"}>
          {balanced ? <Check /> : <AlertTriangle />}
          {balanced
            ? "Rateio conferido"
            : `Faltam R$ ${centsToMoney(Math.max(0, totalCents - allocatedCents))}`}
        </span>
      </div>
      <div className="allocation-grid">
        {RESTAURANTS.map((restaurant) => (
          <Field
            key={restaurant}
            label={`${restaurant} · ${CRS_ALLOCATION[restaurant]}%`}
            value={allocations[restaurant]}
            onChange={() => {}}
            readOnly
          />
        ))}
      </div>
      <div className="entries">
        <div className="entries-head">
          <span>LANÇAMENTO</span>
          <span>CLIENTE / FORNECEDOR</span>
          <span>VALOR</span>
        </div>
        {entries.map((entry, index) => (
          <div className="entry" key={entry.type + entry.party}>
            <span
              className={
                entry.type === "Receita"
                  ? "entry-type income"
                  : "entry-type expense"
              }
            >
              {index + 1}. {entry.type}
            </span>
            <div>
              <strong>{entry.party || "Fornecedor pendente"}</strong>
              <small>{entry.description}</small>
            </div>
            <b>R$ {entry.amount || "0,00"}</b>
          </div>
        ))}
      </div>
      <div className="flow-checks">
        <span>
          <Check /> 4 receitas destinadas aos restaurantes
        </span>
        <span>
          <Check /> 1 despesa destinada ao beneficiário
        </span>
        <span className={balanced ? "ok" : ""}>
          {balanced ? <Check /> : <AlertTriangle />} Receitas = despesa
        </span>
      </div>
      {connected && !done && <details className="ca-panel" open>
        <summary>Vínculos dos cinco lançamentos na Conta Azul da CRS</summary>
        <div className="mapgrid">
          <Field label="Conta financeira fixa" value={CRS_FIXED_ACCOUNT} onChange={()=>{}} readOnly/>
          {RESTAURANTS.map((restaurant)=><MapSelect key={'category-'+restaurant} label={'Categoria: '+CRS_CATEGORY_NAMES[restaurant]} value={mappings.receivableCategoryIds[restaurant] || ''} items={catalogs.categories} onChange={(v)=>onMappings({...mappings,receivableCategoryIds:{...mappings.receivableCategoryIds,[restaurant]:v}})}/>)}
          <MapSelect label="Categoria da despesa" value={mappings.payableCategoryId} items={catalogs.categories} onChange={(v)=>onMappings({...mappings,payableCategoryId:v})}/>
          {RESTAURANTS.map((restaurant)=><MapSelect key={restaurant} label={'Cliente: '+CRS_CLIENT_NAMES[restaurant]} value={mappings.clientIds[restaurant] || ''} items={catalogs.clients} onChange={(v)=>onMappings({...mappings,clientIds:{...mappings.clientIds,[restaurant]:v}})}/>)}
          <MapSelect label="Fornecedor da despesa" value={mappings.supplierId} items={catalogs.suppliers} onChange={(v)=>onMappings({...mappings,supplierId:v})}/>
        </div>
      </details>}
      {!connected && <p className="crs-note">Conecte e confira a licença da CRS para enviar os lançamentos.</p>}
      {connected && !mappings.accountId && <div className="notice"><AlertTriangle size={18}/><div><strong>Conta Azul</strong><p>A conta {CRS_FIXED_ACCOUNT} não foi encontrada na licença da CRS.</p></div></div>}
      {error && <div className="notice"><AlertTriangle size={18}/><div><strong>Conta Azul</strong><p>{error}</p></div></div>}
      {!!results.length && <div className="flow-checks">{results.map((item,index)=><span key={index}>{item.type} · {item.party}: {item.status} {item.protocolId && '· '+item.protocolId}</span>)}</div>}
      {done ? (
        <div className="success">
          <Check /> Envio dos cinco lançamentos solicitado à Conta Azul.
        </div>
      ) : (
        <button
          className="confirm"
          disabled={busy || !connected || !mappings.accountId || !balanced || !form.supplier || !form.payment}
          onClick={onPrepare}
        >
          <CloudUpload /> {busy ? 'Preparando...' : 'Revisar envio à Conta Azul'}
        </button>
      )}
    </div>
  );
}

export function App() {
  const [house, setHouse] = useState<House>(() => {
    const saved = localStorage.getItem(HOUSE_STORAGE_KEY);
    return HOUSES.includes(saved as House)
      ? (saved as House)
      : "Bafo da Prainha";
  });
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [stage, setStage] = useState<"empty" | "loading" | "ready" | "done">(
      "empty",
    );
  const [form, setForm] = useState<Form>(empty),
    [drag, setDrag] = useState(false),
    [warnings, setWarnings] = useState<string[]>([]),
    [progress, setProgress] = useState(0),
    [ocrText, setOcrText] = useState("");
  const [allocations, setAllocations] = useState<Record<Restaurant, string>>({
    "Bafo da Prainha": "",
    Capiau: "",
    "Dois de Fevereiro": "",
    "Casa Porto": "",
  });
  const input = useRef<HTMLInputElement>(null);
  const recurring = ["Gelo", "Gás", "Carvão"].includes(form.kind);
  const crsFlow = form.kind === "Rateio CRS";
  const [caStatus, setCaStatus] = useState({
      configured: false,
      connected: false,
    }),
    [catalogs, setCatalogs] = useState<Catalogs>(blankCatalogs),
    [mappings, setMappings] = useState<Mappings>(blankMappings),
    [caBusy, setCaBusy] = useState(false),
    [caError, setCaError] = useState(""),
    [review, setReview] = useState<any>(null),
    [created, setCreated] = useState<any>(null);
  const [crsCatalogs,setCrsCatalogs] = useState<CrsCatalogs>(blankCrsCatalogs);
  const [crsMappings,setCrsMappings] = useState<CrsMappings>(blankCrsMappings);
  const [crsResults,setCrsResults] = useState<any[]>([]);
  const bridgeTarget = useRef<Partial<Record<ConnectedHouse, Window>>>({});
  const bridgeNonce = useRef<Record<ConnectedHouse, string>>({
    "Bafo da Prainha": crypto.randomUUID(),
    "Casa de Apoio CRS": crypto.randomUUID(),
  });
  const pendingBridge = useRef(new Map<string, {resolve:(value:any)=>void; reject:(reason:Error)=>void}>());
  const [bridgeOrigins, setBridgeOrigins] = useState<Partial<Record<ConnectedHouse, string>>>({});
  const bridgeOrigin = hasBridge(house) ? bridgeOrigins[house] || "" : "";
  const [accessKeys, setAccessKeys] = useState<Partial<Record<ConnectedHouse, string>>>({});
  const accessKey = hasBridge(house) ? accessKeys[house] || "" : "";
  const [cpfLookup, setCpfLookup] = useState<CpfLookup>({cpf:"",people:[],loading:false,error:""});
  const [caUnlocked, setCaUnlocked] = useState(false);
  const [connectedCompany, setConnectedCompany] = useState("");
  const [companyChecked, setCompanyChecked] = useState(false);
  const bridgeCall = (action:string, body:unknown = {}, targetHouse: House = house) => new Promise<any>((resolve,reject) => {
    if (!hasBridge(targetHouse)) return reject(new Error("Esta casa ainda não tem ponte Conta Azul."));
    const origin = bridgeOrigins[targetHouse];
    const target = bridgeTarget.current[targetHouse];
    if (!origin || !target) return reject(new Error("Ponte Conta Azul indisponível."));
    const id = crypto.randomUUID();
    pendingBridge.current.set(id,{resolve,reject});
    target.postMessage({source:"fluxo-ca-site",nonce:bridgeNonce.current[targetHouse],id,action,body,accessKey:action==="status"?"":accessKeys[targetHouse] || ""},origin);
    window.setTimeout(() => {
      const pending=pendingBridge.current.get(id);
      if(pending){pendingBridge.current.delete(id);pending.reject(new Error("A ponte Conta Azul não respondeu."));}
    },30000);
  });
  useEffect(() => {
    const receive=(event:MessageEvent) => {
      if(event.data?.source!=="fluxo-ca-bridge")return;
      const targetHouse=CONNECTED_HOUSES.find((candidate)=>bridgeNonce.current[candidate]===event.data.nonce);
      if(!targetHouse)return;
      if(!/^https:\/\/[a-z0-9-]+\.googleusercontent\.com$/.test(event.origin))return;
      if(event.data.type==="ready"){
        bridgeTarget.current[targetHouse]=event.source as Window;
        setBridgeOrigins((current)=>current[targetHouse]===event.origin?current:{...current,[targetHouse]:event.origin});
        return;
      }
      if(event.source!==bridgeTarget.current[targetHouse])return;
      if(event.data.type!=="result")return;
      const pending=pendingBridge.current.get(event.data.id);
      if(!pending)return;
      pendingBridge.current.delete(event.data.id);
      if(event.data.error)pending.reject(new Error(event.data.error));else pending.resolve(event.data.result);
    };
    window.addEventListener("message",receive);
    return()=>window.removeEventListener("message",receive);
  },[]);
  useEffect(() => {
    if(!hasBridge(house) || bridgeOrigin)return;
    const timer=window.setTimeout(()=>setCaError("A ponte Conta Azul não carregou. Atualize a implantação do Apps Script."),12000);
    return()=>window.clearTimeout(timer);
  },[house,bridgeOrigin]);
  const load = async (f: File) => {
    if (!f || (f.type !== "application/pdf" && !f.type.startsWith("image/")))
      return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setStage("loading");
    setWarnings([]);
    setProgress(0);
    setCreated(null);
    setCrsCatalogs(blankCrsCatalogs);
    setCrsMappings(blankCrsMappings);
    setCrsResults([]);
    setReview(null);
    setAllocations({
      "Bafo da Prainha": "",
      Capiau: "",
      "Dois de Fevereiro": "",
      "Casa Porto": "",
    });
    setMappings((x) => ({ ...x, contactId: "" }));
    try {
      const raw =
        f.type === "application/pdf"
          ? await readPdf(f)
          : (
              await recognize(f, "por+eng", {
                logger: (m) => {
                  if (m.status === "recognizing text")
                    setProgress(Math.round((m.progress || 0) * 100));
                },
              })
            ).data.text;
      setOcrText(raw);
      const p = parse(raw);
      setForm(p.form);
      if (p.form.kind === "Rateio CRS") setHouse("Casa de Apoio CRS");
      setWarnings(p.warnings);
    } catch {
      setForm(empty);
      setWarnings([
        "Não foi possível ler este arquivo. Tente um PDF válido ou um print mais nítido.",
      ]);
    } finally {
      setStage("ready");
    }
  };
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files || [])].find((x) =>
        x.type.startsWith("image/"),
      );
      if (f) load(f);
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, []);
  useEffect(() => {
    localStorage.setItem(HOUSE_STORAGE_KEY, house);
  }, [house]);
  useEffect(() => {
    if (!crsFlow) return;
    const total = moneyToCents(form.amount);
    let distributed = 0;
    const next = {} as Record<Restaurant, string>;
    RESTAURANTS.forEach((restaurant, index) => {
      const cents =
        index === RESTAURANTS.length - 1
          ? total - distributed
          : Math.round((total * CRS_ALLOCATION[restaurant]) / 100);
      distributed += cents;
      next[restaurant] = centsToMoney(cents);
    });
    setAllocations(next);
  }, [crsFlow, form.amount]);
  useEffect(() => {
    if (!ocrText || stage === "loading") return;
    const parsed = parse(ocrText);
    setForm(parsed.form);
    setWarnings(parsed.warnings);
  }, [ocrText, stage, PARSER_VERSION]);
  useEffect(() => {
    let active = true;
    setCaStatus({ configured: false, connected: false });
    setCatalogs(blankCatalogs);
    setMappings(blankMappings);
    setCaError("");
    setReview(null);
    setCreated(null);
    setCaUnlocked(false);
    setConnectedCompany("");
    setCompanyChecked(false);
    if (hasBridge(house) && bridgeOrigin) {
      bridgeCall("status")
        .then((status) => {if(active)setCaStatus(status);})
        .catch((error) => {if(active)setCaError(error.message);});
    }
    return () => {
      active = false;
    };
  }, [house, bridgeOrigin]);
  useEffect(() => {
    if(!hasBridge(house) || !bridgeOrigin)return;
    const refresh=() => bridgeCall("status").then(setCaStatus).catch(error=>setCaError(error.message));
    window.addEventListener("focus",refresh);
    return()=>window.removeEventListener("focus",refresh);
  },[house,bridgeOrigin]);
  useEffect(() => {
    if (house!=="Bafo da Prainha" || !caStatus.connected || form.kind !== "Banda") return;
    const category = catalogs.categories.find(
      (x) => nameKey(x.name) === "couvert artistico",
    );
    const account = catalogs.accounts.find((x) =>
      nameKey(x.name).startsWith("1.banco safra - conta corrente"),
    );
    setMappings((current) => {
      const next = {
        ...current,
        categoryId: category?.id || "",
        accountId: account?.id || "",
        costCenterId: "",
      };
      return JSON.stringify(next) === JSON.stringify(current) ? current : next;
    });
  }, [house, form.kind, catalogs, caStatus.connected]);
  useEffect(() => {
    const cpf = digits(form.pix);
    if (house!=="Bafo da Prainha" || !caUnlocked || form.kind !== "Banda" || !validCpf(cpf)) {
      setCpfLookup({cpf:"",people:[],loading:false,error:""});
      return;
    }
    let active = true;
    setCpfLookup({cpf,people:[],loading:true,error:""});
    bridgeCall("findSupplierByCpf",{cpf})
      .then((result) => { if(active)setCpfLookup({cpf,people:result.people || [],loading:false,error:""}); })
      .catch(() => { if(active)setCpfLookup({cpf,people:[],loading:false,error:"Não foi possível consultar o CPF no Conta Azul."}); });
    return () => { active = false; };
  }, [house, form.pix, form.kind, caUnlocked]);
  const cpf = digits(form.pix);
  const supplierSuggestions = validCpf(cpf)
    ? (cpfLookup.cpf === cpf ? cpfLookup.people : [])
    : catalogs.people.filter((person) => nameKey(person.name).startsWith(nameKey(form.supplier)) && form.supplier.trim().length >= 4).slice(0,5);
  const update = (k: keyof Form, v: string) => {
    if (k === "supplier" || k === "pix") setMappings((x) => ({...x,contactId:""}));
    setForm((x) => ({ ...x, [k]: v }));
  };
  const reset = () => {
    setFile(null);
    setPreview("");
    setStage("empty");
    setForm(empty);
    setWarnings([]);
    setOcrText("");
    setProgress(0);
    setAllocations({
      "Bafo da Prainha": "",
      Capiau: "",
      "Dois de Fevereiro": "",
      "Casa Porto": "",
    });
  };
  const choose = (kind: Kind) => {
    if (kind === "Rateio CRS") setHouse("Casa de Apoio CRS");
    setForm((x) => ({
      ...x,
      kind,
      category:
        kind === "Banda"
          ? "Couvert Artístico"
          : kind === "Rateio CRS"
            ? "Benefício Cidadania"
            : kind,
      description:
        kind === "Banda" && x.competence
          ? `Data do evento: ${x.competence} Banda: ${x.bandName}`
          : kind === "Rateio CRS"
            ? "Rateio de despesa CRS"
            : "",
    }));
  };
  const totalCents = moneyToCents(form.amount),
    allocatedCents = RESTAURANTS.reduce(
      (sum, item) => sum + moneyToCents(allocations[item]),
      0,
    ),
    allocationBalanced = totalCents > 0 && allocatedCents === totalCents;
  const crsEntries: CrsEntry[] = [
    ...RESTAURANTS.map((party) => ({
      type: "Receita" as const,
      party,
      amount: allocations[party],
      description: `Rateio ${form.category} - ${party}`,
    })),
    {
      type: "Despesa",
      party: form.supplier,
      amount: form.amount,
      description: form.description,
    },
  ];
  const requestCa = async (action: string, body:unknown = {}) => {
    if(house!=="Bafo da Prainha" || !caUnlocked)throw new Error("Confirme o acesso à licença do Bafo antes de criar.");
    const result=await bridgeCall(action,body);
    if(result.ok===false)throw new Error(result.message || "A ponte Conta Azul recusou a operação.");
    return result;
  };
  const inspectCa = async () => {
    setCaBusy(true);setCaError("");
    try {
      const identity=await bridgeCall("identity");
      const company=identity.company || {};
      const name=String(company.nome_fantasia || company.razao_social || company.nome || company.id_empresa || "Empresa não identificada");
      if (house==="Casa de Apoio CRS" && !['FIRMA CARIOCA DE BALCAO','CRS SERVICO DE APOIO ADMINISTRATIVO LTDA'].includes(name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase())) throw new Error('A licença conectada não corresponde à CRS. Confira a empresa no Conta Azul.');
      setConnectedCompany(name);
      setCompanyChecked(true);
      if (house==="Casa de Apoio CRS") {
        const loaded=await bridgeCall("catalogs");
        setCrsCatalogs({...blankCrsCatalogs,...loaded});
        const clientIds:Record<string,string>={},receivableCategoryIds:Record<string,string>={};
        RESTAURANTS.forEach((restaurant)=>{
          clientIds[restaurant]=uniqueCaMatch(loaded.clients || [],CRS_CLIENT_NAMES[restaurant]);
          receivableCategoryIds[restaurant]=uniqueCaMatch(loaded.categories || [],CRS_CATEGORY_NAMES[restaurant]);
        });
        setCrsMappings({
          ...blankCrsMappings,
          accountId:uniqueCaMatch(loaded.accounts || [],CRS_FIXED_ACCOUNT),
          payableCategoryId:uniqueCaMatch(loaded.categories || [],form.category),
          supplierId:uniqueCaMatch(loaded.suppliers || [],form.supplier),
          clientIds,receivableCategoryIds,
        });
      }
    } catch(error) {
      setCaError(error instanceof Error?error.message:"Não foi possível conferir a empresa.");
    } finally {setCaBusy(false);}
  };
  const unlockCa = async () => {
    setCaBusy(true);setCaError("");
    try {
      const [c,m]=await Promise.all([bridgeCall("catalogs"),bridgeCall("mappings")]);
      setCatalogs({...blankCatalogs,...c});
      setMappings({...blankMappings,...m});
      if(c.warnings?.length)setCaError(c.warnings.join(" · "));
      setCaUnlocked(true);
    } catch(error) {
      setCaUnlocked(false);
      setCaError(error instanceof Error?error.message:"Não foi possível acessar a licença.");
    } finally {setCaBusy(false);}
  };
  const saveMappings = async (next: Mappings) => {
    setMappings(next);
    await requestCa("saveMappings",{mappings:next});
  };
  const previewCa = async () => {
    setCaBusy(true);
    setCaError("");
    try {
      await saveMappings(mappings);
      const result = await requestCa("previewPayable",{form,mappings});
      setReview(result);
    } catch (e) {
      setCaError(
        e instanceof Error ? e.message : "Erro ao preparar lançamento",
      );
    } finally {
      setCaBusy(false);
    }
  };
  const createCa = async () => {
    setCaBusy(true);
    setCaError("");
    try {
      const result = await requestCa("createPayable",{form,mappings,confirm:true});
      setCreated(result);
      setReview(null);
      setStage("done");
    } catch (e) {
      setCaError(e instanceof Error ? e.message : "Erro ao criar lançamento");
    } finally {
      setCaBusy(false);
    }
  };
  const previewCrs = async () => {
    setCaBusy(true);setCaError('');
    try {
      const result=await bridgeCall('previewRateio',{form,mappings:crsMappings});
      if(result.ok===false)throw new Error(result.message || 'Revise os vínculos.');
      setReview({kind:'crs',entries:result.entries});
    } catch(e) {setCaError(e instanceof Error?e.message:'Não foi possível preparar o rateio.');}
    finally {setCaBusy(false);}
  };
  const createCrs = async () => {
    setCaBusy(true);setCaError('');
    try {
      const result=await bridgeCall('createRateio',{form,mappings:crsMappings,confirm:true});
      setCrsResults(result.results || []);
      setReview(null);
      if(result.ok===false)throw new Error(result.message || 'Envio parcial. Confira os protocolos.');
      setStage('done');
    } catch(e) {setCaError(e instanceof Error?e.message:'Não foi possível enviar o rateio.');}
    finally {setCaBusy(false);}
  };
  return (
    <main>
      {CONNECTED_HOUSES.map((connectedHouse)=><iframe
        key={connectedHouse}
        title={"Ponte Conta Azul — "+connectedHouse}
        src={BRIDGES[connectedHouse]+"?action=bridge&nonce="+bridgeNonce.current[connectedHouse]}
        style={{display:"none"}}
      />)}
      <header>
        <div className="brand">
          <div className="brandmark">FL</div>
          <div>
            <strong>Fluxo</strong>
            <span>Assistente financeiro</span>
          </div>
        </div>
        <label className="house-picker">
          <span>Casa em gestão</span>
          <div>
            <Building2 size={16} />
            <select
              aria-label="Casa em gestão"
              value={house}
              onChange={(e) => setHouse(e.target.value as House)}
            >
              {HOUSES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <ChevronDown size={14} />
          </div>
        </label>
        {!hasBridge(house) ? (
          <div className="ca-connected">Integração desta casa pendente</div>
        ) : caStatus.connected ? (
          <div className="ca-access">
            <div className="ca-connected"><ShieldCheck size={15} /> Conta Azul conectada {connectedCompany && "· "+connectedCompany}</div>
            {!companyChecked && <><input
              aria-label="Chave de acesso do Fluxo"
              type="password"
              autoComplete="off"
              placeholder="Chave de acesso do Fluxo"
              value={accessKey}
              onChange={e=>setAccessKeys((current)=>({...current,[house]:e.target.value}))}
            /><button className="ca-connect" disabled={caBusy || !accessKey} onClick={inspectCa}>Conferir empresa</button>
            </>}
            {companyChecked && house==="Bafo da Prainha" && !caUnlocked && <button className="ca-connect" disabled={caBusy || connectedCompany==="Empresa não identificada"} onClick={unlockCa}>Confirmar Bafo da Prainha</button>}
            {companyChecked && house==="Casa de Apoio CRS" && <div className="ca-connected">Licença conferida · lançamentos da CRS em preparação</div>}
          </div>
        ) : (
          <button
            className="ca-connect"
            disabled={!bridgeOrigin}
            onClick={() => window.open(BRIDGES[house]+"?action=authorize","_blank","noopener,noreferrer")}
          >
            <Link2 size={15} />{" "}
            {caStatus.configured
              ? "Conectar " + house
              : "Configurar Conta Azul"}
          </button>
        )}
      </header>
      {caError && stage==="empty" && <div className="notice"><AlertTriangle size={18}/><p>{caError}</p></div>}
      <section className="intro">
        <div>
          <p className="eyebrow">
            NOVA ORDEM · {house.toLocaleUpperCase("pt-BR")}
          </p>
          <h1>
            Transforme um print em um
            <br />
            <em>lançamento pronto.</em>
          </h1>
          <p className="sub">
            Envie a ordem de pagamento de {house}. A leitura identifica apenas o
            que está no print e sinaliza o que precisa de revisão.
          </p>
        </div>
        <div className="progress">
          <span className="active">1</span>
          <i />
          <span
            className={stage === "ready" || stage === "done" ? "active" : ""}
          >
            2
          </span>
          <i />
          <span className={stage === "done" ? "active" : ""}>3</span>
          <small>Enviar</small>
          <small>Revisar</small>
          <small>Confirmar</small>
        </div>
      </section>
      <section className="workspace">
        <div className="leftcol">
          <div className="sectionhead">
            <div>
              <b>01</b>
              <h2>Ordem de pagamento</h2>
            </div>
            {file && (
              <button className="link" onClick={reset}>
                <RotateCcw size={14} /> Trocar imagem
              </button>
            )}
          </div>
          {stage === "empty" ? (
            <div
              className={"drop " + (drag ? "drag" : "")}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                load(e.dataTransfer.files[0]);
              }}
              onClick={() => input.current?.click()}
            >
              <input
                ref={input}
                type="file"
                accept="image/*,application/pdf"
                hidden
                onChange={(e) => e.target.files?.[0] && load(e.target.files[0])}
              />
              <div className="uploadicon">
                <UploadCloud />
              </div>
              <h3>Arraste o arquivo para cá</h3>
              <p>ou clique para escolher um print ou boleto</p>
              <div className="paste">
                <Clipboard size={16} /> Cole com <kbd>Ctrl</kbd> + <kbd>V</kbd>
              </div>
              <small>PDF, PNG, JPG ou WEBP · até 10 MB</small>
            </div>
          ) : (
            <div className="previewbox">
              <div className="filebar">
                <span>
                  <FileImage size={17} />
                  {file?.name}
                </span>
                <button onClick={reset}>
                  <X size={17} />
                </button>
              </div>
              {file?.type === "application/pdf" ? (
                <object
                  data={preview}
                  type="application/pdf"
                  aria-label="Prévia do boleto"
                />
              ) : (
                <img src={preview} />
              )}{" "}
              {stage === "loading" && (
                <div className="scanning">
                  <span />
                  <div>
                    <Sparkles size={18} /> Lendo o arquivo... {progress}%
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="rulebox">
            <div className="bulb">
              <Sparkles size={17} />
            </div>
            <div>
              <strong>Regras aplicadas</strong>
              <p>
                {crsFlow
                  ? "Na CRS, o boleto gera quatro receitas para os restaurantes e uma despesa para o beneficiário."
                  : "Banda cria lançamento novo. Gelo, Gás e Carvão atualizam a recorrência aberta."}
              </p>
            </div>
          </div>
        </div>
        <div
          className={
            "rightcol " +
            (stage === "empty" || stage === "loading" ? "muted" : "")
          }
        >
          <div className="sectionhead">
            <div>
              <b>02</b>
              <h2>Sugestão do lançamento</h2>
            </div>
            {stage === "ready" && (
              <span className="confidence">
                <CircleGauge size={15} />{" "}
                {warnings.length ? "Revisão necessária" : "Dados identificados"}
              </span>
            )}
          </div>
          {stage === "empty" || stage === "loading" ? (
            <div className="waiting">
              <Sparkles />
              <h3>
                {stage === "loading"
                  ? "Lendo seu arquivo"
                  : "A sugestão aparecerá aqui"}
              </h3>
              <p>
                {stage === "loading"
                  ? `Leitura: ${progress}%`
                  : "Envie um print ou boleto para começar."}
              </p>
            </div>
          ) : crsFlow ? (
            <CrsReview
              form={form}
              update={update}
              allocations={allocations}
              entries={crsEntries}
              totalCents={totalCents}
              allocatedCents={allocatedCents}
              balanced={allocationBalanced}
              done={stage === "done"}
              catalogs={crsCatalogs}
              mappings={crsMappings}
              onMappings={setCrsMappings}
              busy={caBusy}
              connected={house==='Casa de Apoio CRS' && companyChecked && caStatus.connected}
              onPrepare={previewCrs}
              error={caError}
              results={crsResults}
            />
          ) : (
            <div className="suggestion">
              <div className="actionrow">
                <div>
                  <small>AÇÃO SUGERIDA</small>
                  <span className={recurring ? "badge recurring" : "badge new"}>
                    {recurring ? <RotateCcw /> : <Check />}
                    {recurring
                      ? "Atualizar recorrência em aberto"
                      : "Novo lançamento"}
                  </span>
                </div>
                <label className="service">
                  <small>SERVIÇO IDENTIFICADO</small>
                  <div className="selectwrap">
                    {form.kind === "Banda" ? (
                      <Music2 />
                    ) : form.kind === "Gelo" ? (
                      <Snowflake />
                    ) : (
                      <Flame />
                    )}
                    <select
                      value={form.kind}
                      onChange={(e) => choose(e.target.value as Kind)}
                    >
                      <option>Banda</option>
                      <option>Gelo</option>
                      <option>Gás</option>
                      <option>Carvão</option>
                      <option>Rateio CRS</option>
                    </select>
                    <ChevronDown />
                  </div>
                </label>
              </div>
              <div className="divider" />
              <div className="formgrid">
                <Field
                  label="Fornecedor / favorecido"
                  value={form.supplier}
                  onChange={(v) => update("supplier", v)}
                  wide
                />
                {!recurring && (
                  <Field
                    label="Nome da banda"
                    value={form.bandName}
                    onChange={(v) => {
                      update("bandName", v);
                      setForm((x) => ({
                        ...x,
                        description: x.competence
                          ? `Data do evento: ${x.competence} Banda: ${v}`
                          : "",
                      }));
                    }}
                    wide
                  />
                )}
                <Field
                  label="Valor"
                  value={form.amount}
                  onChange={(v) => update("amount", v)}
                />
                <Field
                  label="Data de pagamento"
                  value={form.payment}
                  onChange={(v) => update("payment", v)}
                />
                {recurring && (
                  <Field
                    label="Dias referentes"
                    value={form.referenceDays}
                    onChange={(v) => update("referenceDays", v)}
                    wide
                  />
                )}
                <Field
                  label="Competência"
                  value={form.competence}
                  onChange={(v) => update("competence", v)}
                />
                <Field
                  label="Categoria"
                  value={form.category}
                  onChange={(v) => update("category", v)}
                />
                <Field
                  label="Descrição"
                  value={form.description}
                  onChange={(v) => update("description", v)}
                  wide
                />
                <Field
                  label="Chave PIX"
                  value={form.pix}
                  onChange={(v) => update("pix", v)}
                  wide
                />
              </div>
              {warnings.map((w) => (
                <div className="notice" key={w}>
                  <AlertTriangle size={18} />
                  <div>
                    <strong>Revisar</strong>
                    <p>{w}</p>
                  </div>
                </div>
              ))}
              <details className="ocr">
                <summary>Ver texto lido do print</summary>
                <pre>{ocrText || "Nenhum texto reconhecido."}</pre>
              </details>
              {caStatus.connected && caUnlocked && !recurring && (
                <details className="ca-panel" open>
                  <summary>Vínculos com o Conta Azul</summary>
                  <div className="mapgrid">
                    <MapSelect
                      label="Favorecido no Conta Azul"
                      value={mappings.contactId}
                      items={[...catalogs.people,...supplierSuggestions.filter((candidate) => !catalogs.people.some((person) => person.id === candidate.id))]}
                      onChange={(v) =>
                        setMappings((x) => ({ ...x, contactId: v }))
                      }
                    />
                    {cpfLookup.loading && <p>Consultando CPF da chave PIX no Conta Azul...</p>}
                    {cpfLookup.error && <p>{cpfLookup.error}</p>}
                    {validCpf(cpf) && !cpfLookup.loading && cpfLookup.cpf === cpf && !supplierSuggestions.length && <p>Nenhum fornecedor encontrado por esse CPF. Escolha o cadastro manualmente.</p>}
                    {!!supplierSuggestions.length && <div className="supplier-suggestions">
                      <strong>{validCpf(cpf) ? "Cadastro encontrado pelo CPF do PIX" : "Possíveis cadastros pelo nome"}</strong>
                      {supplierSuggestions.map((person) => <button key={person.id} type="button" onClick={() => setMappings((x) => ({...x,contactId:person.id}))}>
                        {person.name}{mappings.contactId === person.id ? " ✓ Selecionado" : " · Usar este cadastro"}
                      </button>)}
                    </div>}
                    <MapSelect
                      label="Categoria"
                      value={mappings.categoryId}
                      items={catalogs.categories}
                      onChange={(v) =>
                        setMappings((x) => ({ ...x, categoryId: v }))
                      }
                    />
                    <MapSelect
                      label="Conta financeira"
                      value={mappings.accountId}
                      items={catalogs.accounts}
                      onChange={(v) =>
                        setMappings((x) => ({ ...x, accountId: v }))
                      }
                    />
                    <MapSelect
                      label="Centro de custo"
                      optional
                      value={mappings.costCenterId}
                      items={catalogs.costCenters}
                      onChange={(v) =>
                        setMappings((x) => ({ ...x, costCenterId: v }))
                      }
                    />
                  </div>
                </details>
              )}
              {caError && (
                <div className="notice">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>Conta Azul</strong>
                    <p>{caError}</p>
                  </div>
                </div>
              )}
              {created ? (
                <div className="success">
                  <Check />{" "}
                  {created.duplicatePrevented
                    ? "Duplicidade evitada — lançamento já enviado."
                    : `Enviado ao Conta Azul · protocolo ${created.protocolId || "registrado"}`}
                </div>
              ) : stage === "done" ? (
                <div className="success">
                  <Check /> Sugestão confirmada.
                </div>
              ) : caStatus.connected && caUnlocked && !recurring ? (
                <button
                  className="confirm"
                  disabled={caBusy}
                  onClick={previewCa}
                >
                  <CloudUpload size={18} />{" "}
                  {caBusy ? "Preparando..." : "Criar no Conta Azul"}
                </button>
              ) : house==="Bafo da Prainha" && !recurring ? (
                <button className="confirm" disabled>Conecte e acesse a licença para criar</button>
              ) : (
                <button className="confirm" onClick={() => setStage("done")}>
                  <Check size={18} /> Confirmar sugestão
                </button>
              )}
            </div>
          )}
        </div>
      </section>
      {review && (
        <div className="modalback">
          <div className="modal">
            <button className="modalx" onClick={() => setReview(null)}>
              <X />
            </button>
            <span className="modalicon">
              <CloudUpload />
            </span>
            <h2>Confirmar criação no Conta Azul</h2>
            <p>
              Revise antes do envio. Depois de confirmar, {review.kind==='crs' ? 'os cinco lançamentos serão enviados de verdade.' : 'o lançamento será criado de verdade.'}
            </p>
            {review.kind==='crs' ? <dl>{review.entries.map((entry:any,index:number)=><div key={index}><dt>{index+1}. {entry.type} · {entry.party}</dt><dd>R$ {(entry.cents/100).toLocaleString('pt-BR',{minimumFractionDigits:2})} · {entry.type==='Receita' ? CRS_CLIENT_NAMES[entry.party as Restaurant] : crsCatalogs.suppliers.find(x=>x.id===crsMappings.supplierId)?.name} · {crsCatalogs.categories.find(x=>x.id===entry.payload.rateio[0].id_categoria)?.name}</dd></div>)}<div><dt>Licença</dt><dd>{connectedCompany} (CRS)</dd></div><div><dt>Vencimento</dt><dd>{form.payment}</dd></div></dl> :
            <dl>
              <div>
                <dt>Casa</dt>
                <dd>{house}</dd>
              </div>
              <div>
                <dt>Favorecido</dt>
                <dd>{form.supplier}</dd>
              </div>
              <div>
                <dt>Valor</dt>
                <dd>R$ {form.amount}</dd>
              </div>
              <div>
                <dt>Competência</dt>
                <dd>{form.competence}</dd>
              </div>
              <div>
                <dt>Vencimento</dt>
                <dd>{form.payment}</dd>
              </div>
              <div className="wide">
                <dt>Descrição</dt>
                <dd>{form.description}</dd>
              </div>
            </dl>}
            <div className="modalactions">
              <button onClick={() => setReview(null)}>Voltar e revisar</button>
              <button className="confirm" disabled={caBusy} onClick={review.kind==='crs' ? createCrs : createCa}>
                {caBusy ? "Enviando..." : "Confirmar e criar"}
              </button>
            </div>
          </div>
        </div>
      )}
      <footer>
        <span>FLUXO · MVP</span>
        <p>Somente informações encontradas no print são sugeridas.</p>
      </footer>
    </main>
  );
}

