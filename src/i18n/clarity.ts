import type { Translations } from '../lib/i18n';

// Clearer wording: suggestions on the decider card, chat questions (not votes), the History
// fold-away, host-only settings, the kitty switch and the price range.
export const translations: Translations = {
  ms: {
    // Decider card
    '🗳️ Put it to a vote': '🗳️ Buat undian',
    '✨ Suggest one': '✨ Cadangkan satu',
    'No ideas right now: add a few foods to the food list first.': 'Tiada idea buat masa ini: tambah beberapa makanan ke senarai dulu.',
    'OK': 'OK',
    'Close the suggestion': 'Tutup cadangan',
    // Challenges
    'Let the wheel pick 2 meals': 'Biar roda pilih 2 hidangan',
    'Challenges & badges': 'Cabaran & lencana',
    '{done} of {total} challenges this week · {badges} badges · {places} places': '{done} daripada {total} cabaran minggu ini · {badges} lencana · {places} tempat',
    // Chat questions
    'No messages yet. Say who’s running late, or tap 📊 to ask everyone a question.': 'Belum ada mesej. Beritahu siapa lambat, atau tekan 📊 untuk tanya semua orang.',
    'Ask everyone a question': 'Tanya semua orang',
    'Question from {name}: {question}': 'Soalan daripada {name}: {question}',
    'Your question': 'Soalan kamu',
    'Question from {name}': 'Soalan daripada {name}',
    '1 answer': '1 jawapan',
    '{n} answers': '{n} jawapan',
    'Ask everyone': 'Tanya semua',
    'A quick question for the room, like where to meet or who wants dessert. It doesn’t pick today’s food: for that, use “Put it to a vote” on Today.':
      'Soalan ringkas untuk bilik, seperti di mana nak jumpa atau siapa nak pencuci mulut. Ia tidak memilih makanan hari ini: untuk itu, guna “Buat undian” di Hari ini.',
    'Ask': 'Tanya',
    // Profile
    'Price range for suggestions': 'Julat harga untuk cadangan',
    'Pricier foods stay off the wheel and nearby ideas. For tracking what you spend, use the monthly budget below.':
      'Makanan yang lebih mahal tidak masuk roda dan idea berdekatan. Untuk jejak perbelanjaan, guna bajet bulanan di bawah.',
    // Host-only settings and the kitty
    '{name} is the host: they set the order and the rules, and can remove people from the room.':
      '{name} ialah hos: mereka tetapkan susunan dan peraturan, dan boleh keluarkan orang dari bilik.',
    'Use a group kitty': 'Guna tabung kumpulan',
    '{name} keeps the kitty now.': '{name} pegang tabung sekarang.',
    'Only {name}, the host, can change this.': 'Hanya {name}, hos, boleh ubah ini.',
    'Only {name}, the host, can change these.': 'Hanya {name}, hos, boleh ubah semua ini.',
  },
  zh: {
    // Decider card
    '🗳️ Put it to a vote': '🗳️ 发起投票',
    '✨ Suggest one': '✨ 推荐一个',
    'No ideas right now: add a few foods to the food list first.': '暂时没有推荐：先往食物清单里加几样吧。',
    'OK': '好',
    'Close the suggestion': '关闭推荐',
    // Challenges
    'Let the wheel pick 2 meals': '让转盘选 2 餐',
    'Challenges & badges': '挑战与徽章',
    '{done} of {total} challenges this week · {badges} badges · {places} places': '本周挑战 {done}/{total} · {badges} 个徽章 · {places} 个地方',
    // Chat questions
    'No messages yet. Say who’s running late, or tap 📊 to ask everyone a question.': '还没有消息。说说谁会晚到，或者点 📊 问大家一个问题。',
    'Ask everyone a question': '问大家一个问题',
    'Question from {name}: {question}': '{name} 的问题：{question}',
    'Your question': '你的问题',
    'Question from {name}': '{name} 的问题',
    '1 answer': '1 个回答',
    '{n} answers': '{n} 个回答',
    'Ask everyone': '问问大家',
    'A quick question for the room, like where to meet or who wants dessert. It doesn’t pick today’s food: for that, use “Put it to a vote” on Today.':
      '给房间的小问题，比如在哪儿集合、谁要甜点。它不会决定今天吃什么：要决定的话，用“今天”页的“发起投票”。',
    'Ask': '提问',
    // Profile
    'Price range for suggestions': '推荐的价格范围',
    'Pricier foods stay off the wheel and nearby ideas. For tracking what you spend, use the monthly budget below.':
      '更贵的食物不会出现在转盘和附近推荐里。要记录花费，请用下面的每月预算。',
    // Host-only settings and the kitty
    '{name} is the host: they set the order and the rules, and can remove people from the room.': '{name} 是房主：由他们设定顺序和规则，也可以把人移出房间。',
    'Use a group kitty': '使用公款',
    '{name} keeps the kitty now.': '现在由 {name} 管公款。',
    'Only {name}, the host, can change this.': '只有房主 {name} 可以更改。',
    'Only {name}, the host, can change these.': '只有房主 {name} 可以更改这些。',
  },
};
