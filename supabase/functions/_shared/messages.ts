// What the notifications say, in each phone's language. Shared by the notify and send-reminders
// Edge Functions; tested from src/lib/notify.test.ts.

export type Lang = 'en' | 'ms' | 'zh';
export type Meal = 'lunch' | 'dinner';

export type Event =
  | { type: 'proposed'; decider: string; food: string; meal: Meal }
  | { type: 'decided'; food: string; meal: Meal }
  | { type: 'bill'; payer: string; amount: string; food: string; share: string }
  | { type: 'tapau'; runner: string; place: string }
  | { type: 'order'; who: string; item: string }
  | { type: 'nudge'; to: string; amount: string; several: boolean }
  | { type: 'vote'; decider: string; options: string }
  | { type: 'meet'; time: string; place: string }
  | { type: 'late'; who: string }
  | { type: 'leaving'; time: string; place: string }
  | { type: 'chat'; who: string; room: string; text: string }
  | { type: 'join'; who: string; room: string }
  | { type: 'kitty'; amount: string; food: string; share: string }
  | { type: 'treat'; payer: string; food: string }
  | { type: 'event'; who: string; title: string; when: string }
  | { type: 'your-turn' }
  | { type: 'secret-open' };

type Text = { title: string; body: string };

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);

const MEAL: Record<Lang, Record<Meal, string>> = {
  en: { lunch: 'lunch', dinner: 'dinner' },
  ms: { lunch: 'makan tengah hari', dinner: 'makan malam' },
  zh: { lunch: '午餐', dinner: '晚餐' },
};

const TEXT: Record<Event['type'], Record<Lang, [string, string]>> = {
  proposed: {
    en: ['{decider} picked {food} for {meal}', 'Tap to accept or veto.'],
    ms: ['{decider} pilih {food} untuk {meal}', 'Tekan untuk terima atau veto.'],
    zh: ['{decider}选了{food}作为{meal}', '点开接受或否决。'],
  },
  decided: {
    en: ['{Meal} is decided: {food}', 'Tap for places nearby.'],
    ms: ['{Meal} dah diputuskan: {food}', 'Tekan untuk tempat berdekatan.'],
    zh: ['{meal}定了：{food}', '点开看附近的店。'],
  },
  bill: {
    en: ['{payer} paid {amount} for {food}', 'Your share is {share}.'],
    ms: ['{payer} bayar {amount} untuk {food}', 'Bahagian kamu {share}.'],
    zh: ['{payer}为{food}付了{amount}', '你的份额是{share}。'],
  },
  tapau: {
    en: ['{runner} is buying from {place}', 'Add your order before they go.'],
    ms: ['{runner} akan beli dari {place}', 'Tambah pesanan kamu sebelum dia bertolak.'],
    zh: ['{runner}要去{place}买', '出发前快加上你的点单。'],
  },
  order: {
    en: ['{who} added an order', '{item}'],
    ms: ['{who} tambah pesanan', '{item}'],
    zh: ['{who}加了点单', '{item}'],
  },
  nudge: {
    en: ['You owe {to} {amount}', 'Pay them back, then tap Mark paid in Bills.'],
    ms: ['Kamu hutang {to} {amount}', 'Bayar balik, kemudian tekan Tanda dah bayar dalam Bil.'],
    zh: ['你欠{to} {amount}', '还钱后，在账单里点“标记已付”。'],
  },
  vote: {
    en: ['{decider} put lunch to a vote', '{options}. Tap to vote.'],
    ms: ['{decider} buat undian makan', '{options}. Tekan untuk undi.'],
    zh: ['{decider}发起了投票', '{options}。点开投票。'],
  },
  meet: {
    en: ['Leaving at {time}', 'Meet at {place}.'],
    ms: ['Bertolak pukul {time}', 'Jumpa di {place}.'],
    zh: ['{time}出发', '在{place}集合。'],
  },
  late: {
    en: ['{who} is running late', 'Wait up, or go ahead and save them a seat.'],
    ms: ['{who} lambat sikit', 'Tunggu sekejap, atau pergi dulu dan simpan tempat.'],
    zh: ['{who}会晚一点', '等一下，或先去帮忙留个位。'],
  },
  leaving: {
    en: ['Leaving in 10 minutes', '{time} · {place}'],
    ms: ['Bertolak dalam 10 minit', '{time} · {place}'],
    zh: ['10分钟后出发', '{time} · {place}'],
  },
  chat: {
    en: ['{who} · {room}', '{text}'],
    ms: ['{who} · {room}', '{text}'],
    zh: ['{who} · {room}', '{text}'],
  },
  join: {
    en: ['{who} wants to join {room}', 'Tap to let them in.'],
    ms: ['{who} nak sertai {room}', 'Tekan untuk benarkan masuk.'],
    zh: ['{who}想加入{room}', '点开让他们进来。'],
  },
  kitty: {
    en: ['{amount} for {food} came out of the kitty', 'Your share is {share}.'],
    ms: ['{amount} untuk {food} dibayar daripada tabung', 'Bahagian kamu {share}.'],
    zh: ['公款付了{food}的{amount}', '你的份额是{share}。'],
  },
  treat: {
    en: ['{payer} is treating you to {food} 🎉', 'Nothing to pay back. Say thanks!'],
    ms: ['{payer} belanja kamu {food} 🎉', 'Tak perlu bayar balik. Ucap terima kasih!'],
    zh: ['{payer}请你吃{food} 🎉', '不用还钱，记得说声谢谢！'],
  },
  event: {
    en: ['{who} planned {title}', '{when}. Tap to say if you’re going.'],
    ms: ['{who} rancang {title}', '{when}. Tekan untuk beritahu kamu datang atau tidak.'],
    zh: ['{who}安排了{title}', '{when}。点开告诉大家你去不去。'],
  },
  'your-turn': {
    en: ['It’s your turn to choose', 'Makan apa? Spin the wheel or pick something for today.'],
    ms: ['Giliran kamu untuk pilih', 'Makan apa? Putar roda atau pilih sesuatu untuk hari ini.'],
    zh: ['轮到你选了', '吃什么？转转盘或直接选一个。'],
  },
  'secret-open': {
    en: ['Secret picks are open', 'Make your pick so the wheel can spin.'],
    ms: ['Pilihan rahsia dibuka', 'Buat pilihan kamu supaya roda boleh berputar.'],
    zh: ['秘密选择开始了', '选好你的，转盘才能转。'],
  },
};

const NUDGE_SEVERAL: Record<Lang, string> = {
  en: 'You owe {amount} in total',
  ms: 'Kamu hutang {amount} semuanya',
  zh: '你一共欠{amount}',
};

export function message(e: Event, lang: Lang = 'en'): Text {
  const l: Lang = lang in TEXT.proposed ? lang : 'en';
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(e)) if (typeof v === 'string') vars[k] = v;
  if ('meal' in e) {
    vars.meal = MEAL[l][e.meal];
    vars.Meal = vars.meal.charAt(0).toUpperCase() + vars.meal.slice(1);
  }
  const [title, body] = TEXT[e.type][l];
  if (e.type === 'nudge' && e.several) return { title: fill(NUDGE_SEVERAL[l], vars), body: fill(body, vars) };
  return { title: fill(title, vars), body: fill(body, vars) };
}

