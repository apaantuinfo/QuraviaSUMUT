// Usage: node tools/validate-prayer-times.js
// Compares the on-device calculation with prayer times published by Kemenag RI (Bimas Islam),
// as reproduced by Kompas.com / Detik.com / Liputan6 pages on the dates below.
const PT = require('../js/prayer-times.js');
const C = require('../js/cities.js');
const toMin = s => { const [h,m]=s.split(':').map(Number); return h*60+m; };
// [label, cityId, date, expected]  (published Kemenag/Bimas Islam values found via search)
const truth = [
  ['Medan 2026-02-20','medan',[2026,2,20],{imsak:'05:13',fajr:'05:23',dhuhr:'12:42',asr:'16:00',maghrib:'18:43',isha:'19:52'}],
  ['Medan 2026-03-04','medan',[2026,3,4],{imsak:'05:11',fajr:'05:21',sunrise:'06:32',dhuhr:'12:40',asr:'15:54',maghrib:'18:42'}],
  ['Medan 2026-09-28','medan',[2026,9,28],{fajr:'04:59',sunrise:'06:10',dhuhr:'12:19',asr:'15:28',maghrib:'18:22',isha:'19:30'}],
  ['Medan 2026-09-29','medan',[2026,9,29],{fajr:'04:59',sunrise:'06:10',dhuhr:'12:19',asr:'15:28',maghrib:'18:21',isha:'19:30'}],
  ['Medan 2026-09-30','medan',[2026,9,30],{fajr:'04:58',sunrise:'06:10',dhuhr:'12:19',asr:'15:28',maghrib:'18:21',isha:'19:29'}],
  ['Karo 2026-09-30','karo',[2026,9,30],{imsak:'04:49',fajr:'04:59',dhuhr:'12:20',asr:'15:28',maghrib:'18:26',isha:'19:30'}],
  ['Tapanuli Utara 2026-09-30','tapanuli-utara',[2026,9,30],{imsak:'04:47',fajr:'04:57',dhuhr:'12:18',asr:'15:25',maghrib:'18:24',isha:'19:28'}],
  ['Pakpak Bharat 2026-09-30','pakpak-bharat',[2026,9,30],{fajr:'05:00',dhuhr:'12:20',asr:'15:28',maghrib:'18:27',isha:'19:31'}],
  ['Labuhanbatu 2026-08-01','labuhanbatu',[2026,8,1],{imsak:'04:52',fajr:'05:02',dhuhr:'12:31',asr:'15:52',maghrib:'18:36',isha:'19:48'}],
  ['Labuhanbatu 2026-08-04','labuhanbatu',[2026,8,4],{fajr:'05:02',dhuhr:'12:30',asr:'15:51',maghrib:'18:36',isha:'19:48'}],
];
let n=0, exact=0, within1=0, worst=0, sum=0;
for (const [label,id,[y,m,d],exp] of truth) {
  const city = C.byId(id);
  const t = PT.calculate(y,m,d,city,{});
  const bad=[];
  for (const k in exp) {
    const got = PT.formatTime(t[k],7); const diff = toMin(got)-toMin(exp[k]);
    n++; sum+=Math.abs(diff); worst=Math.max(worst,Math.abs(diff)); if(!diff) exact++; if(Math.abs(diff)<=1) within1++;
    if (diff) bad.push(`${k} ${got} vs ${exp[k]} (${diff>0?'+':''}${diff})`);
  }
  console.log(label.padEnd(28), bad.length? bad.join(' | ') : 'all exact');
}
console.log(`\nSUMMARY: ${n} published values | exact ${exact} (${(100*exact/n).toFixed(0)}%) | within 1 min ${within1} (${(100*within1/n).toFixed(0)}%) | worst ${worst} min | mean abs ${(sum/n).toFixed(2)} min`);
