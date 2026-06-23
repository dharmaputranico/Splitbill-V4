'use client';
import { useState } from 'react';
import styles from './SplitBillApp.module.css';

const COLORS = [
  { bg: '#e1f5ee', text: '#0f6e56' }, { bg: '#eeedfe', text: '#3c3489' },
  { bg: '#faece7', text: '#993c1d' }, { bg: '#e6f1fb', text: '#185fa5' },
  { bg: '#faeeda', text: '#854f0b' }, { bg: '#fbeaf0', text: '#993556' },
  { bg: '#eaf3de', text: '#3b6d11' }, { bg: '#fcebeb', text: '#a32d2d' },
];
const ini = n => n.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
const avStyle = i => { const c = COLORS[i % COLORS.length]; return { background: c.bg, color: c.text }; };
const fmt = n => Math.round(Number(n)).toLocaleString('id-ID');

let _itemId = 0, _memberId = 0;
const newItemId = () => ++_itemId;
const newMemberId = () => ++_memberId;

function getCharges({ items, svcMode, svcValue, taxMode, taxValue, otherFixed }) {
  const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0);
  const svcAmt = svcMode === 'percent' ? subtotal * (svcValue / 100) : svcValue;
  const taxBase = subtotal + svcAmt;
  const taxAmt = taxMode === 'percent' ? taxBase * (taxValue / 100) : taxValue;
  const total = subtotal + svcAmt + taxAmt + otherFixed;
  return { subtotal, svcAmt, taxAmt, otherFixed, total };
}

export default function SplitBillApp() {
  const [step, setStep] = useState(0); // 0 = intro
  const [restaurant, setRestaurant] = useState('');
  const [items, setItems] = useState([]);
  const [svcMode, setSvcMode] = useState('percent');
  const [svcValue, setSvcValue] = useState('');
  const [taxMode, setTaxMode] = useState('percent');
  const [taxValue, setTaxValue] = useState('');
  const [otherFixed, setOtherFixed] = useState('');
  const [members, setMembers] = useState([]);
  const [allocMode, setAllocMode] = useState({});
  const [allocUnits, setAllocUnits] = useState({});
  const [results, setResults] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [uploadedMediaType, setUploadedMediaType] = useState('image/jpeg');
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState('1');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [copied, setCopied] = useState(false);

  const charges = getCharges({
    items, svcMode, svcValue: parseFloat(svcValue) || 0,
    taxMode, taxValue: parseFloat(taxValue) || 0,
    otherFixed: parseFloat(otherFixed) || 0
  });

  const goStep = (n) => {
    if (n === 2 && items.length === 0) { alert('Please add at least one item first'); return; }
    if (n === 3 && members.length < 2) { alert('Please add at least 2 members'); return; }
    if (n === 3) initAlloc();
    setStep(n);
  };

  const handleFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setUploadedMediaType(file.type || 'image/jpeg');
    const reader = new FileReader();
    reader.onload = ev => {
      setPreviewUrl(ev.target.result);
      setUploadedImage(ev.target.result.split(',')[1]);
      setScanStatus('Image ready — click "Scan with AI"');
    };
    reader.readAsDataURL(file);
  };

  const scanReceipt = async () => {
    if (!uploadedImage) return;
    setScanning(true); setScanStatus('Reading receipt...');
    try {
      const res = await fetch('/api/scan-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: uploadedImage, mediaType: uploadedMediaType })
      });
      const data = await res.json();
      if (data.error) {
        const detail = data.debug ? ` — ${data.debug}` : '';
        const raw = data.raw_response ? `\n\nRaw response: ${data.raw_response}` : '';
        throw new Error(`${data.error}${detail}${raw}`);
      }
      const p = data.result;
      if (p.restaurant) setRestaurant(p.restaurant);
      if (p.items?.length) setItems(p.items.map(it => ({ id: newItemId(), name: it.name, qty: Number(it.qty) || 1, price: Number(it.price) || 0 })));
      if (p.svc_pct) { setSvcValue(String(p.svc_pct)); setSvcMode('percent'); }
      else if (p.svc_fixed) { setSvcValue(String(p.svc_fixed)); setSvcMode('fixed'); }
      if (p.tax_pct) { setTaxValue(String(p.tax_pct)); setTaxMode('percent'); }
      else if (p.tax_fixed) { setTaxValue(String(p.tax_fixed)); setTaxMode('fixed'); }
      if (p.other_fixed) setOtherFixed(String(p.other_fixed));
      setScanStatus(`✓ Found ${p.items?.length || 0} items. Review and edit if needed.`);
    } catch (err) {
      console.error('Scan failed:', err);
      setScanStatus(`❌ ${err.message}`);
    }
    setScanning(false);
  };

  const addItem = () => {
    if (!newItemName.trim()) return;
    setItems(prev => [...prev, { id: newItemId(), name: newItemName.trim(), qty: parseInt(newItemQty) || 1, price: parseFloat(newItemPrice) || 0 }]);
    setNewItemName(''); setNewItemPrice(''); setNewItemQty('1');
  };
  const removeItem = id => setItems(prev => prev.filter(it => it.id !== id));
  const updateItem = (id, field, val) => setItems(prev => prev.map(it => it.id !== id ? it : {
    ...it, [field]: field === 'qty' ? (parseInt(val) || 1) : field === 'price' ? (parseFloat(val) || 0) : val
  }));

  const addMember = () => {
    if (!newMemberName.trim()) return;
    setMembers(prev => [...prev, { id: newMemberId(), name: newMemberName.trim() }]);
    setNewMemberName('');
  };
  const removeMember = id => setMembers(prev => prev.filter(m => m.id !== id));
  const updateMemberName = (id, name) => setMembers(prev => prev.map(m => m.id !== id ? m : { ...m, name }));

  const initAlloc = () => {
    const newMode = { ...allocMode }, newUnits = { ...allocUnits };
    items.forEach(it => {
      if (!newMode[it.id]) newMode[it.id] = 'equal';
      members.forEach(m => { if (newUnits[`${it.id}_${m.id}`] === undefined) newUnits[`${it.id}_${m.id}`] = 0; });
    });
    setAllocMode(newMode); setAllocUnits(newUnits);
  };

  const splitAllEqually = () => {
    const newMode = {}, newUnits = {};
    items.forEach(it => { newMode[it.id] = 'equal'; members.forEach(m => { newUnits[`${it.id}_${m.id}`] = 1; }); });
    setAllocMode(newMode); setAllocUnits(newUnits);
  };

  const setItemMode = (itemId, mode) => {
    setAllocMode(prev => ({ ...prev, [itemId]: mode }));
    const newUnits = { ...allocUnits };
    members.forEach(m => { newUnits[`${itemId}_${m.id}`] = 0; });
    setAllocUnits(newUnits);
  };

  const stepUnit = (itemId, memberId, delta) => {
    const key = `${itemId}_${memberId}`;
    setAllocUnits(prev => ({ ...prev, [key]: Math.max(0, (prev[key] || 0) + delta) }));
  };

  const toggleEqual = (itemId, memberId, checked) => {
    setAllocUnits(prev => ({ ...prev, [`${itemId}_${memberId}`]: checked ? 1 : 0 }));
  };

  const calculate = () => {
    const unalloc = items.filter(it => !members.some(m => allocUnits[`${it.id}_${m.id}`] > 0));
    if (unalloc.length && !window.confirm(`${unalloc.length} item(s) unassigned: ${unalloc.map(i => i.name).join(', ')}. Continue?`)) return;
    const { subtotal, svcAmt, taxAmt, otherFixed: otherAmt } = charges;
    const totalCharges = svcAmt + taxAmt + otherAmt;
    const memberFood = {}, memberItems = {};
    members.forEach(m => { memberFood[m.id] = 0; memberItems[m.id] = []; });
    items.forEach(it => {
      const mode = allocMode[it.id] || 'equal';
      const totalUnits = members.reduce((s, m) => s + (allocUnits[`${it.id}_${m.id}`] || 0), 0);
      const itemTotal = it.qty * it.price;
      members.forEach(m => {
        const units = allocUnits[`${it.id}_${m.id}`] || 0; if (!units) return;
        const assigned = members.filter(m2 => allocUnits[`${it.id}_${m2.id}`] > 0);
        const share = mode === 'unit' ? (totalUnits > 0 ? (units / totalUnits) * itemTotal : 0) : (assigned.length > 0 ? itemTotal / assigned.length : 0);
        memberFood[m.id] += share;
        memberItems[m.id].push({ name: it.name + (mode === 'unit' ? ` (${units}/${it.qty})` : it.qty > 1 ? ` ×${it.qty}` : ''), amount: share });
      });
    });
    const memberTotals = {};
    members.forEach(m => {
      const portion = subtotal > 0 ? memberFood[m.id] / subtotal : 1 / members.length;
      memberTotals[m.id] = memberFood[m.id] + totalCharges * portion;
      if (svcAmt > 0) memberItems[m.id].push({ name: 'Service charge', amount: svcAmt * portion });
      if (taxAmt > 0) memberItems[m.id].push({ name: 'Tax (PPN)', amount: taxAmt * portion });
      if (otherAmt > 0) memberItems[m.id].push({ name: 'Other charges', amount: otherAmt * portion });
    });
    setResults({ totals: memberTotals, items: memberItems });
    setStep(4);
  };

  const copyResults = () => {
    let text = restaurant ? `🧾 ${restaurant}\n\n` : '🧾 Split Bill Summary\n\n';
    members.forEach(m => { text += `${m.name}: Rp ${fmt(results.totals[m.id])}\n`; });
    text += '\nPowered by SplitBill — splitbill.id';
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const allocShare = (it, m) => {
    const mode = allocMode[it.id] || 'equal';
    const units = allocUnits[`${it.id}_${m.id}`] || 0;
    const totalUnits = members.reduce((s, m2) => s + (allocUnits[`${it.id}_${m2.id}`] || 0), 0);
    const assigned = members.filter(m2 => allocUnits[`${it.id}_${m2.id}`] > 0);
    if (!units) return null;
    if (mode === 'unit' && totalUnits > 0) return `${(units / totalUnits * 100).toFixed(1)}% · Rp ${fmt(units / totalUnits * it.qty * it.price)}`;
    if (mode === 'equal' && assigned.length > 0) return `${(1 / assigned.length * 100).toFixed(1)}% · Rp ${fmt(it.qty * it.price / assigned.length)}`;
    return null;
  };

  const allocBadge = (it) => {
    if ((allocMode[it.id] || 'equal') !== 'unit') return null;
    const total = members.reduce((s, m) => s + (allocUnits[`${it.id}_${m.id}`] || 0), 0);
    const rem = it.qty - total;
    if (rem === 0) return { cls: 'exact', label: 'All assigned' };
    if (rem > 0) return { cls: 'ok', label: `${rem} left` };
    return { cls: 'over', label: `${Math.abs(rem)} over` };
  };

  return (
    <div className={styles.app}>

      {/* ── STEP 0: INTRO ── */}
      {step === 0 && (
        <div className={styles.introWrap}>
          <div className={styles.introLogo}>
            <div className={styles.logoMark}>
              <svg viewBox="0 0 20 20" fill="none" width="20" height="20">
                <rect x="2" y="3" width="11" height="14" rx="1.5" stroke="white" strokeWidth="1.4"/>
                <path d="M7 7h5M7 10h5M7 13h3" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
                <path d="M14 9l4 4M14 13l4-4" stroke="#6ee7b7" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </div>
            <span className={styles.introLogoText}>SplitBill</span>
          </div>

          <div className={styles.originRow}>
            <div className={styles.originLine}/>
            <div className={styles.originText}>From the founder of LINE SplitBill · Indonesia's first split bill service</div>
            <div className={styles.originLine}/>
          </div>

          <h1 className={styles.introTitle}>Fair splits,<br/>zero drama.</h1>

          <p className={styles.introBody}>
            Years ago, I built LINE SplitBill — the first split bill service in Indonesia,
            used by hundreds of thousands of people across the country. That idea still matters.
            So I rebuilt it from scratch, smarter — with AI receipt scanning and unit-based splitting —
            and made it completely free for everyone to use.
          </p>

          <div className={styles.introPills}>
            <span className={styles.introPill}>📷 AI receipt scan</span>
            <span className={styles.introPill}>🍕 Split by portion</span>
            <span className={styles.introPill}>🔓 Free, no sign-up</span>
          </div>

          <button className={styles.introBtn} onClick={() => setStep(1)}>
            Start splitting →
          </button>

          <div className={styles.introFootnote}>
            No account needed. Your data never leaves your device.
          </div>
        </div>
      )}

      {/* ── STEPS 1–4 ── */}
      {step > 0 && (
        <>
          {/* Logo bar */}
          <div className={styles.logo}>
            <div className={styles.logoMark} onClick={() => setStep(0)} style={{cursor:'pointer'}} title="Back to home">
              <svg viewBox="0 0 20 20" fill="none" width="20" height="20">
                <rect x="2" y="3" width="11" height="14" rx="1.5" stroke="white" strokeWidth="1.4"/>
                <path d="M7 7h5M7 10h5M7 13h3" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
                <path d="M14 9l4 4M14 13l4-4" stroke="#6ee7b7" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div className={styles.logoText}>SplitBill</div>
              <div className={styles.logoSub}>fair splits, zero drama</div>
            </div>
          </div>

          {/* Step indicator */}
          <div className={styles.stepIndicator}>
            {['Receipt','Members','Allocate','Result'].map((label, i) => (
              <div key={i} className={`${styles.step} ${step===i+1?styles.stepActive:''} ${step>i+1?styles.stepDone:''}`}
                onClick={() => step > i+1 && goStep(i+1)}>
                <span className={styles.stepNum}>{i+1}</span>{label}
              </div>
            ))}
          </div>

          {/* STEP 1 */}
          {step === 1 && (
            <div>
              <div className={styles.sectionTitle}>Add your receipt</div>
              <div className={styles.sectionSub}>Scan a photo or enter items manually</div>

              <label className={styles.uploadZone}>
                <input type="file" accept="image/*" onChange={handleFile} style={{display:'none'}} />
                {previewUrl ? <img src={previewUrl} className={styles.uploadPreview} alt="receipt" /> : <>
                  <span className={styles.uploadIcon}>📷</span>
                  <div className={styles.uploadTitle}>Tap to upload receipt photo</div>
                  <div className={styles.uploadHint}>AI will read items automatically</div>
                </>}
              </label>

              {scanStatus && <div className={styles.statusMsg}>{scanStatus}</div>}
              <button className={styles.scanBtn} onClick={scanReceipt} disabled={!uploadedImage || scanning}>
                {scanning ? <><span className={styles.spinner}/> Scanning...</> : 'Scan with AI'}
              </button>

              <div className={styles.dividerRow}><div className={styles.dividerLine}/><div className={styles.dividerText}>or enter manually</div><div className={styles.dividerLine}/></div>

              <input type="text" value={restaurant} onChange={e=>setRestaurant(e.target.value)} placeholder="Restaurant name (optional)" className={styles.fullInput} style={{marginBottom:12}} />

              <table className={styles.itemsTable}>
                <thead><tr>
                  <th style={{width:'42%'}}>Item</th>
                  <th style={{width:'15%',textAlign:'center'}}>Qty</th>
                  <th style={{width:'30%',textAlign:'right'}}>Unit price</th>
                  <th style={{width:'13%'}}/>
                </tr></thead>
                <tbody>
                  {items.map(it => (
                    <tr key={it.id}>
                      <td><input className={styles.itemNameInput} value={it.name} onChange={e=>updateItem(it.id,'name',e.target.value)}/></td>
                      <td><input type="number" className={styles.qtyInput} min="1" value={it.qty} onChange={e=>updateItem(it.id,'qty',e.target.value)}/></td>
                      <td><input type="number" className={styles.priceInput} min="0" step="any" value={it.price} onChange={e=>updateItem(it.id,'price',e.target.value)}/></td>
                      <td><button className={styles.delBtn} onClick={()=>removeItem(it.id)}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className={styles.addItemRow}>
                <input type="text" value={newItemName} onChange={e=>setNewItemName(e.target.value)} placeholder="Item name" onKeyDown={e=>e.key==='Enter'&&addItem()} className={styles.flexInput}/>
                <input type="number" value={newItemQty} onChange={e=>setNewItemQty(e.target.value)} placeholder="Qty" min="1" className={styles.qtyInput} style={{width:55}}/>
                <input type="number" value={newItemPrice} onChange={e=>setNewItemPrice(e.target.value)} placeholder="Price" min="0" step="any" className={styles.qtyInput} style={{width:80}}/>
                <button className={styles.addItemBtn} onClick={addItem}>+ Add</button>
              </div>

              {/* Charges — inline rows */}
              <div className={styles.chargesSection}>
                {[
                  { key:'svc', label:'Service charge', hint:'on subtotal', mode:svcMode, setMode:setSvcMode, value:svcValue, setValue:setSvcValue, hasToggle:true },
                  { key:'tax', label:'Tax (PPN)', hint:'on subtotal + service', mode:taxMode, setMode:setTaxMode, value:taxValue, setValue:setTaxValue, hasToggle:true },
                  { key:'other', label:'Other charges', hint:'fixed amount', mode:'fixed', setMode:null, value:otherFixed, setValue:setOtherFixed, hasToggle:false },
                ].map(({ key, label, hint, mode, setMode, value, setValue, hasToggle }) => (
                  <div key={key} className={styles.chargeRow}>
                    <div className={styles.chargeRowLabel}>
                      <span className={styles.chargeRowLabelText}>{label}</span>
                      <span className={styles.chargeHint}>{hint}</span>
                    </div>
                    {hasToggle && (
                      <div className={styles.chargeModeToggle}>
                        <button className={`${styles.chargeModeBtn} ${mode==='percent'?styles.chargeModeBtnActive:''}`} onClick={()=>setMode('percent')}>%</button>
                        <button className={`${styles.chargeModeBtn} ${mode==='fixed'?styles.chargeModeBtnActive:''}`} onClick={()=>setMode('fixed')}>Rp</button>
                      </div>
                    )}
                    <div className={styles.chargeValueWrap}>
                      <input type="number" value={value} onChange={e=>setValue(e.target.value)} placeholder="0" min="0" step="any" className={styles.chargeInput}/>
                      <span className={styles.chargeSuffix}>{mode==='percent'?'%':'Rp'}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              {items.length > 0 && (
                <div className={styles.totalsBlock}>
                  <div className={styles.totalsRow}><span>Subtotal</span><span>Rp {fmt(charges.subtotal)}</span></div>
                  {charges.svcAmt > 0 && <div className={styles.totalsRow}><span>Service charge{svcMode==='percent'?` (${svcValue}%)`:''}</span><span>Rp {fmt(charges.svcAmt)}</span></div>}
                  {charges.svcAmt > 0 && taxMode==='percent' && parseFloat(taxValue) > 0 && <div className={`${styles.totalsRow} ${styles.totalsRowSub}`}><span>Tax base = subtotal + service</span><span>Rp {fmt(charges.subtotal + charges.svcAmt)}</span></div>}
                  {charges.taxAmt > 0 && <div className={styles.totalsRow}><span>Tax (PPN){taxMode==='percent'?` (${taxValue}%)`:''}</span><span>Rp {fmt(charges.taxAmt)}</span></div>}
                  {charges.otherFixed > 0 && <div className={styles.totalsRow}><span>Other</span><span>Rp {fmt(charges.otherFixed)}</span></div>}
                  <div className={`${styles.totalsRow} ${styles.totalsRowGrand}`}><span>Total</span><span>Rp {fmt(charges.total)}</span></div>
                </div>
              )}

              <div className={styles.navRow}><button className={styles.btnNext} onClick={()=>goStep(2)}>Continue →</button></div>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div>
              <div className={styles.sectionTitle}>Who's splitting?</div>
              <div className={styles.sectionSub}>Add everyone at the table</div>
              <div className={styles.membersList}>
                {members.map((m,i) => (
                  <div key={m.id} className={styles.memberRow}>
                    <div className={styles.memberAvatar} style={avStyle(i)}>{ini(m.name)}</div>
                    <input className={styles.memberNameInput} value={m.name} onChange={e=>updateMemberName(m.id,e.target.value)}/>
                    {members.length > 1 && <button className={styles.removeMember} onClick={()=>removeMember(m.id)}>×</button>}
                  </div>
                ))}
              </div>
              <div className={styles.addMemberRow}>
                <input type="text" value={newMemberName} onChange={e=>setNewMemberName(e.target.value)} placeholder="Name" className={styles.flexInput} onKeyDown={e=>e.key==='Enter'&&addMember()}/>
                <button className={styles.addItemBtn} onClick={addMember}>+ Add</button>
              </div>
              <div className={styles.navRow}>
                <button className={styles.btnBack} onClick={()=>setStep(1)}>← Back</button>
                <button className={styles.btnNext} onClick={()=>goStep(3)}>Continue →</button>
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div>
              <div className={styles.sectionTitle}>Who ate what?</div>
              <div className={styles.sectionSub}>Split all equally, or allocate item by item</div>

              <div className={styles.globalSplitBar}>
                <div className={styles.globalSplitLabel}><strong>Split everything equally</strong> — divide all items evenly among all members</div>
                <button className={styles.globalSplitBtn} onClick={splitAllEqually}>Apply</button>
              </div>

              {items.map(it => {
                const mode = allocMode[it.id] || 'equal';
                const badge = allocBadge(it);
                return (
                  <div key={it.id} className={styles.allocCard}>
                    <div className={styles.allocHeader}>
                      <div>
                        <div className={styles.allocItemName}>{it.name}{it.qty>1&&<span className={styles.allocQtyBadge}> × {it.qty}</span>}</div>
                        <div className={styles.allocItemTotal}>Rp {fmt(it.qty*it.price)}</div>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        {badge && <span className={`${styles.allocBadge} ${styles['allocBadge_'+badge.cls]}`}>{badge.label}</span>}
                        <div className={styles.allocModeToggle}>
                          <button className={`${styles.allocModeBtn} ${mode==='equal'?styles.allocModeBtnActive:''}`} onClick={()=>setItemMode(it.id,'equal')}>Equal</button>
                          <button className={`${styles.allocModeBtn} ${mode==='unit'?styles.allocModeBtnActive:''}`} onClick={()=>setItemMode(it.id,'unit')}>Units</button>
                        </div>
                      </div>
                    </div>
                    <div className={styles.allocMembersRow}>
                      {members.map((m,mi) => {
                        const units = allocUnits[`${it.id}_${m.id}`] || 0;
                        const share = allocShare(it, m);
                        return (
                          <div key={m.id} className={styles.allocMemberCell}>
                            <div className={styles.allocMemberAvatar} style={avStyle(mi)}>{ini(m.name)}</div>
                            <div className={styles.allocMemberName}>{m.name.split(' ')[0]}</div>
                            {mode === 'equal'
                              ? <input type="checkbox" className={styles.allocCheck} checked={units > 0} onChange={e=>toggleEqual(it.id,m.id,e.target.checked)}/>
                              : <div className={styles.unitStepper}>
                                  <button className={styles.unitBtn} onClick={()=>stepUnit(it.id,m.id,-1)}>−</button>
                                  <span className={styles.unitCount}>{units}</span>
                                  <button className={styles.unitBtn} onClick={()=>stepUnit(it.id,m.id,1)}>+</button>
                                </div>
                            }
                            {share && <div className={styles.unitShare}>{share}</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <div className={styles.navRow}>
                <button className={styles.btnBack} onClick={()=>setStep(2)}>← Back</button>
                <button className={styles.btnNext} onClick={calculate}>Calculate splits →</button>
              </div>
            </div>
          )}

          {/* STEP 4 */}
          {step === 4 && results && (
            <div>
              <div className={styles.sectionTitle}>Split summary</div>
              <div className={styles.sectionSub}>Here's what everyone owes</div>

              <div className={styles.resultCards}>
                {members.map((m,i) => (
                  <div key={m.id} className={styles.resultCard}>
                    <div className={styles.resultAvatar} style={avStyle(i)}>{ini(m.name)}</div>
                    <div className={styles.resultName}>{m.name}</div>
                    <div className={styles.resultAmount}>Rp {fmt(results.totals[m.id])}</div>
                  </div>
                ))}
              </div>

              {members.map((m,i) => (
                <div key={m.id} className={styles.shareBox}>
                  <div className={styles.shareTitle}>
                    <div className={styles.resultAvatar} style={{...avStyle(i),width:24,height:24,fontSize:10}}>{ini(m.name)}</div>
                    {m.name} — <strong>Rp {fmt(results.totals[m.id])}</strong>
                  </div>
                  {results.items[m.id].map((it,j) => (
                    <div key={j} className={styles.shareItemRow}>
                      <span className={styles.shareItemName}>{it.name}</span>
                      <span className={styles.shareItemPrice}>Rp {fmt(it.amount)}</span>
                    </div>
                  ))}
                </div>
              ))}

              <div className={styles.navRow}>
                <button className={styles.btnBack} onClick={()=>setStep(3)}>← Back</button>
                <button className={styles.btnNext} onClick={copyResults}>{copied ? 'Copied! ✓' : 'Copy summary'}</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
