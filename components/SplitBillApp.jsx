'use client';

import { useState, useRef } from 'react';
import styles from './SplitBillApp.module.css';

const fmt = (n) =>
  'Rp ' + Math.round(n).toLocaleString('id-ID');

export default function SplitBillApp() {
  const [step, setStep] = useState(0);

  // Receipt items
  const [items, setItems] = useState([]);
  const [newItem, setNewItem] = useState({ name: '', qty: 1, price: '' });
  const [restaurantName, setRestaurantName] = useState('');
  const [uploadedImage, setUploadedImage] = useState(null);

  // Charges
  const [svcMode, setSvcMode] = useState('percent');
  const [svcValue, setSvcValue] = useState(5);
  const [taxMode, setTaxMode] = useState('percent');
  const [taxValue, setTaxValue] = useState(11);

  // Members
  const [members, setMembers] = useState([]);
  const [newMember, setNewMember] = useState('');

  // Allocations: { itemIdx: { memberName: { mode: 'equal'|'units', units: number } } }
  const [allocs, setAllocs] = useState({});

  // Scan state
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const fileRef = useRef();

  // ─── Tax helpers ───────────────────────────────────────────────
  const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0);

  function getCharges() {
    const svcAmt =
      svcMode === 'percent' ? subtotal * (svcValue / 100) : svcValue;
    const taxBase = subtotal + svcAmt;
    const taxAmt =
      taxMode === 'percent' ? taxBase * (taxValue / 100) : taxValue;
    return { svcAmt, taxAmt, total: subtotal + svcAmt + taxAmt };
  }

  // ─── OCR ───────────────────────────────────────────────────────
  async function handleScan(e) {
    const file = e.target.files[0];
    if (!file) return;
    setScanError('');
    setScanning(true);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target.result;
        setUploadedImage(dataUrl);
        const base64 = dataUrl.split(',')[1];
        const mediaType = file.type || 'image/jpeg';
        const res = await fetch('/api/scan-receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, mediaType }),
        });
        const data = await res.json();
        if (data.error) {
          setScanError(
            `❌ ${data.error}${data.debug ? ' — ' + data.debug : ''}${data.raw_response ? '\n\nRaw: ' + data.raw_response : ''}`
          );
        } else if (Array.isArray(data.result)) {
          setItems((prev) => [
            ...prev,
            ...data.result.map((it) => ({
              name: it.name || 'Item',
              qty: Number(it.qty) || 1,
              price: Number(it.price) || 0,
            })),
          ]);
        } else {
          setScanError('❌ Unexpected response from scan API');
        }
        setScanning(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setScanError('❌ ' + err.message);
      setScanning(false);
    }
  }

  // ─── Item helpers ──────────────────────────────────────────────
  function addItem() {
    if (!newItem.name.trim() || !newItem.price) return;
    setItems((prev) => [
      ...prev,
      { name: newItem.name.trim(), qty: Number(newItem.qty), price: Number(newItem.price) },
    ]);
    setNewItem({ name: '', qty: 1, price: '' });
  }

  function removeItem(i) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
    setAllocs((prev) => {
      const next = { ...prev };
      delete next[i];
      // reindex keys above i
      const reindexed = {};
      Object.keys(next).forEach((k) => {
        const ki = Number(k);
        reindexed[ki > i ? ki - 1 : ki] = next[k];
      });
      return reindexed;
    });
  }

  // ─── Member helpers ────────────────────────────────────────────
  function addMember() {
    const name = newMember.trim();
    if (!name || members.includes(name)) return;
    setMembers((prev) => [...prev, name]);
    setNewMember('');
  }

  function removeMember(name) {
    setMembers((prev) => prev.filter((m) => m !== name));
  }

  // Avatar colors per member index
  const AVATAR_COLORS = ['#E8735A', '#5AAE8C', '#7B6FCA', '#E8A95A', '#5A8FCA', '#CA5A7B'];
  function avatarColor(idx) { return AVATAR_COLORS[idx % AVATAR_COLORS.length]; }

  // ─── Allocation helpers ────────────────────────────────────────
  // allocs[itemIdx][member] = { mode: 'equal'|'units', units: number, checked: bool }
  function getAlloc(itemIdx, member) {
    return allocs[itemIdx]?.[member] || { mode: 'equal', units: 1, checked: true };
  }

  function toggleMemberItem(itemIdx, member) {
    const cur = getAlloc(itemIdx, member);
    setAllocs((prev) => ({
      ...prev,
      [itemIdx]: {
        ...prev[itemIdx],
        [member]: { ...cur, checked: !cur.checked },
      },
    }));
  }

  function setItemMode(itemIdx, mode) {
    setAllocs((prev) => {
      const cur = prev[itemIdx] || {};
      const next = {};
      members.forEach((m) => {
        next[m] = { ...(cur[m] || { checked: true, units: 1 }), mode };
      });
      return { ...prev, [itemIdx]: next };
    });
  }

  function setAllocUnits(itemIdx, member, units) {
    setAllocs((prev) => ({
      ...prev,
      [itemIdx]: {
        ...prev[itemIdx],
        [member]: { ...getAlloc(itemIdx, member), units: Number(units) || 1 },
      },
    }));
  }

  function setAllEqualGlobal() {
    const next = {};
    items.forEach((_, i) => {
      next[i] = {};
      members.forEach((m) => {
        next[i][m] = { mode: 'equal', units: 1, checked: true };
      });
    });
    setAllocs(next);
  }

  // Get current mode for an item (equal or units)
  function getItemMode(itemIdx) {
    const memberAllocs = members.map((m) => getAlloc(itemIdx, m));
    return memberAllocs.some((a) => a.mode === 'units') ? 'units' : 'equal';
  }

  // Get checked members for an item
  function getCheckedMembers(itemIdx) {
    return members.filter((m) => getAlloc(itemIdx, m).checked !== false);
  }

  // ─── Results calculation ───────────────────────────────────────
  function calcResults() {
    const { svcAmt, taxAmt, total } = getCharges();
    const charges = svcAmt + taxAmt;
    const totals = {};
    // breakdown[member] = [ { name, qty, share } ]
    const breakdown = {};
    members.forEach((m) => { totals[m] = 0; breakdown[m] = []; });

    items.forEach((item, i) => {
      const itemTotal = item.qty * item.price;
      const checkedMembers = members.filter((m) => getAlloc(i, m).checked !== false);
      if (checkedMembers.length === 0) return;

      const mode = getItemMode(i);

      if (mode === 'units') {
        const totalUnits = checkedMembers.reduce((s, m) => {
          const a = getAlloc(i, m);
          return s + (a.units || 1);
        }, 0);
        checkedMembers.forEach((m) => {
          const a = getAlloc(i, m);
          const u = a.units || 1;
          const share = itemTotal * (u / totalUnits);
          totals[m] += share;
          breakdown[m].push({ name: item.name, qty: item.qty, share });
        });
      } else {
        // equal split among checked members
        const share = itemTotal / checkedMembers.length;
        checkedMembers.forEach((m) => {
          totals[m] += share;
          breakdown[m].push({ name: item.name, qty: item.qty, share });
        });
      }
    });

    // distribute charges proportionally to food subtotal
    const foodSubtotal = members.reduce((s, m) => s + totals[m], 0);
    members.forEach((m) => {
      const ratio = foodSubtotal > 0 ? totals[m] / foodSubtotal : 1 / members.length;
      const svcShare = svcAmt * ratio;
      const taxShare = taxAmt * ratio;
      totals[m] += svcShare + taxShare;
      breakdown[m]._svcShare = svcShare;
      breakdown[m]._taxShare = taxShare;
    });

    return { totals, svcAmt, taxAmt, total, breakdown };
  }

  // ─── Copy summary ──────────────────────────────────────────────
  function copyResults() {
    const { totals, total } = calcResults();
    let text = '🧾 Bill Split — splitbill.co.id\n\n';
    members.forEach((m) => {
      text += `${m}: ${fmt(totals[m])}\n`;
    });
    text += `\nTotal: ${fmt(total)}`;
    text += '\n\nSplit fairly with SplitBill 🍽️';
    navigator.clipboard.writeText(text).catch(() => {});
  }

  // ─── RENDER ────────────────────────────────────────────────────

  // Step 0 — Intro
  if (step === 0) {
    return (
      <div className={styles.introWrap}>
        <div className={styles.originRow}>
          <span className={styles.originLine} />
          <span className={styles.originText}>
            Indonesia's first split bill service · since 2019
          </span>
          <span className={styles.originLine} />
        </div>

        <h1 className={styles.introTitle}>Fair splits,<br />zero drama.</h1>

        <p className={styles.introBody}>
          In 2019, I built Indonesia's first split bill service — and watched it become
          the go-to tool for millions of Indonesians splitting meals with friends.
          This is the next version. Rebuilt smarter, with AI receipt scanning.
          Still free. No sign-up. No drama.
        </p>

        <div className={styles.introPills}>
          <span className={styles.introPill}>📸 AI receipt scan</span>
          <span className={styles.introPill}>⚖️ Split by portion</span>
          <span className={styles.introPill}>✅ Free, no sign-up</span>
        </div>

        <button className={styles.introBtn} onClick={() => setStep(1)}>
          Start splitting →
        </button>

        <p className={styles.introFootnote}>
          No account needed. Your data never leaves your device.
        </p>
      </div>
    );
  }

  // Step 1 — Receipt
  if (step === 1) {
    const { svcAmt, taxAmt, total } = getCharges();
    return (
      <div className={styles.pageWrap}>
        {/* Top bar */}
        <div className={styles.topBar}>
          <div className={styles.topBarInner}>
            <div className={styles.topBarLogo}>
              <div className={styles.logoIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="3" width="18" height="18" rx="3" fill="white" opacity="0.9"/>
                  <path d="M7 8h10M7 12h7M7 16h5" stroke="#111" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <span className={styles.topBarLogoText}>SplitBill</span>
            </div>
            <span className={styles.topBarSub}>fair splits, zero drama</span>
          </div>
        </div>

        {/* Step tabs */}
        <div className={styles.stepTabs}>
          <div className={`${styles.stepTab} ${styles.stepTabActive}`}>
            <span className={styles.stepTabNum}>1</span>
            <span className={styles.stepTabLabel}>Receipt</span>
          </div>
          <div className={styles.stepTab}>
            <span className={styles.stepTabNum}>2</span>
            <span className={styles.stepTabLabel}>Members</span>
          </div>
          <div className={styles.stepTab}>
            <span className={styles.stepTabNum}>3</span>
            <span className={styles.stepTabLabel}>Allocate</span>
          </div>
          <div className={styles.stepTab}>
            <span className={styles.stepTabNum}>4</span>
            <span className={styles.stepTabLabel}>Result</span>
          </div>
        </div>

        <div className={styles.wrap}>
          <h2 className={styles.stepTitle}>Add your receipt</h2>
          <p className={styles.stepSubtitle}>Scan a photo or enter items manually</p>

          {/* Upload zone */}
          <input
            type="file"
            accept="image/*"
            ref={fileRef}
            style={{ display: 'none' }}
            onChange={handleScan}
          />
          <div
            className={styles.uploadZone}
            onClick={() => !scanning && fileRef.current.click()}
          >
            {uploadedImage ? (
              <img src={uploadedImage} alt="Receipt" className={styles.uploadPreview} />
            ) : (
              <>
                <div className={styles.uploadIcon}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                    <rect x="2" y="4" width="20" height="16" rx="2" stroke="#888" strokeWidth="1.5"/>
                    <circle cx="8" cy="10" r="2" stroke="#888" strokeWidth="1.5"/>
                    <path d="M2 16l5-4 4 3 3-2 8 6" stroke="#888" strokeWidth="1.5" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p className={styles.uploadText}>Tap to upload receipt photo</p>
                <p className={styles.uploadHint}>JPG, PNG — AI will read items automatically</p>
              </>
            )}
          </div>

          {/* Scan with AI button */}
          <button
            className={styles.scanWithAiBtn}
            onClick={() => fileRef.current.click()}
            disabled={scanning}
          >
            {scanning ? '⏳ Scanning receipt…' : 'Scan with AI'}
          </button>

          {scanError && <pre className={styles.scanError}>{scanError}</pre>}

          {/* Divider */}
          <div className={styles.orDivider}>
            <span className={styles.orLine} />
            <span className={styles.orText}>or enter manually</span>
            <span className={styles.orLine} />
          </div>

          {/* Restaurant name */}
          <input
            className={styles.restaurantInput}
            placeholder="Restaurant name (optional)"
            value={restaurantName}
            onChange={(e) => setRestaurantName(e.target.value)}
          />

          {/* Item list */}
          {items.length > 0 && (
            <div className={styles.itemList}>
              {items.map((it, i) => (
                <div key={i} className={styles.itemRow}>
                  <span className={styles.itemName}>{it.name}</span>
                  <span className={styles.itemQty}>×{it.qty}</span>
                  <span className={styles.itemPrice}>{fmt(it.qty * it.price)}</span>
                  <button className={styles.removeBtn} onClick={() => removeItem(i)}>✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Add item */}
          <div className={styles.addRow}>
            <input
              className={styles.inputName}
              placeholder="Item name"
              value={newItem.name}
              onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && addItem()}
            />
            <input
              className={styles.inputQty}
              type="number"
              min="1"
              placeholder="Qty"
              value={newItem.qty}
              onChange={(e) => setNewItem((p) => ({ ...p, qty: e.target.value }))}
            />
            <input
              className={styles.inputPrice}
              type="number"
              placeholder="Unit price"
              value={newItem.price}
              onChange={(e) => setNewItem((p) => ({ ...p, price: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && addItem()}
            />
            <button className={styles.addBtn} onClick={addItem}>Add</button>
          </div>

          {/* Service & Tax — inline rows */}
          {items.length > 0 && (
            <div className={styles.chargesSection}>
              <div className={styles.chargeRow}>
                <span className={styles.chargeRowLabel}>
                  <span className={styles.chargeRowLabelText}>Service</span>
                  <span className={styles.chargeHint}>applied on subtotal</span>
                </span>
                <button
                  className={`${styles.chargeModeBtn} ${svcMode === 'percent' ? styles.chargeModeBtnActive : ''}`}
                  onClick={() => setSvcMode('percent')}
                >%</button>
                <button
                  className={`${styles.chargeModeBtn} ${svcMode === 'fixed' ? styles.chargeModeBtnActive : ''}`}
                  onClick={() => setSvcMode('fixed')}
                >Rp</button>
                <input
                  className={styles.chargeInput}
                  type="number"
                  value={svcValue}
                  onChange={(e) => setSvcValue(Number(e.target.value))}
                />
                <span className={styles.chargeAmt}>{fmt(svcAmt)}</span>
              </div>

              <div className={styles.chargeRow}>
                <span className={styles.chargeRowLabel}>
                  <span className={styles.chargeRowLabelText}>Tax (PPN)</span>
                  <span className={styles.chargeHint}>applied on subtotal + service</span>
                </span>
                <button
                  className={`${styles.chargeModeBtn} ${taxMode === 'percent' ? styles.chargeModeBtnActive : ''}`}
                  onClick={() => setTaxMode('percent')}
                >%</button>
                <button
                  className={`${styles.chargeModeBtn} ${taxMode === 'fixed' ? styles.chargeModeBtnActive : ''}`}
                  onClick={() => setTaxMode('fixed')}
                >Rp</button>
                <input
                  className={styles.chargeInput}
                  type="number"
                  value={taxValue}
                  onChange={(e) => setTaxValue(Number(e.target.value))}
                />
                <span className={styles.chargeAmt}>{fmt(taxAmt)}</span>
              </div>

              <div className={styles.totalRow}>
                <span className={styles.totalLabel}>Total</span>
                <span className={styles.totalAmt}>{fmt(total)}</span>
              </div>
            </div>
          )}

          <div className={styles.navRow}>
            <button className={styles.backBtn} onClick={() => setStep(0)}>← Back</button>
            <button
              className={styles.nextBtn}
              disabled={items.length === 0}
              onClick={() => setStep(2)}
            >
              Next: Who's paying? →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 2 — Members
  if (step === 2) {
    return (
      <div className={styles.pageWrap}>
        <div className={styles.topBar}>
          <div className={styles.topBarInner}>
            <div className={styles.topBarLogo}>
              <div className={styles.logoIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="3" width="18" height="18" rx="3" fill="white" opacity="0.9"/>
                  <path d="M7 8h10M7 12h7M7 16h5" stroke="#111" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <span className={styles.topBarLogoText}>SplitBill</span>
            </div>
            <span className={styles.topBarSub}>fair splits, zero drama</span>
          </div>
        </div>
        <div className={styles.stepTabs}>
          <div className={styles.stepTab}><span className={styles.stepTabNum}>1</span><span className={styles.stepTabLabel}>Receipt</span></div>
          <div className={`${styles.stepTab} ${styles.stepTabActive}`}><span className={styles.stepTabNum}>2</span><span className={styles.stepTabLabel}>Members</span></div>
          <div className={styles.stepTab}><span className={styles.stepTabNum}>3</span><span className={styles.stepTabLabel}>Allocate</span></div>
          <div className={styles.stepTab}><span className={styles.stepTabNum}>4</span><span className={styles.stepTabLabel}>Result</span></div>
        </div>
        <div className={styles.wrap}>
        <h2 className={styles.stepTitle}>Who's splitting?</h2>

        <div className={styles.addRow}>
          <input
            className={styles.inputName}
            placeholder="Name"
            value={newMember}
            onChange={(e) => setNewMember(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addMember()}
          />
          <button className={styles.addBtn} onClick={addMember}>Add</button>
        </div>

        <div className={styles.memberList}>
          {members.map((m) => (
            <div key={m} className={styles.memberRow}>
              <span className={styles.memberAvatar}>{m[0].toUpperCase()}</span>
              <span className={styles.memberName}>{m}</span>
              <button className={styles.removeBtn} onClick={() => removeMember(m)}>✕</button>
            </div>
          ))}
        </div>

        <div className={styles.navRow}>
          <button className={styles.backBtn} onClick={() => setStep(1)}>← Back</button>
          <button
            className={styles.nextBtn}
            disabled={members.length < 2}
            onClick={() => setStep(3)}
          >
            Next: Allocate items →
          </button>
        </div>
        </div>
      </div>
    );
  }

  // Step 3 — Allocate
  if (step === 3) {
    return (
      <div className={styles.pageWrap}>
        <div className={styles.topBar}>
          <div className={styles.topBarInner}>
            <div className={styles.topBarLogo}>
              <div className={styles.logoIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="3" width="18" height="18" rx="3" fill="white" opacity="0.9"/>
                  <path d="M7 8h10M7 12h7M7 16h5" stroke="#111" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <span className={styles.topBarLogoText}>SplitBill</span>
            </div>
            <span className={styles.topBarSub}>fair splits, zero drama</span>
          </div>
        </div>
        <div className={styles.stepTabs}>
          <div className={styles.stepTab}><span className={styles.stepTabNum}>1</span><span className={styles.stepTabLabel}>Receipt</span></div>
          <div className={styles.stepTab}><span className={styles.stepTabNum}>2</span><span className={styles.stepTabLabel}>Members</span></div>
          <div className={`${styles.stepTab} ${styles.stepTabActive}`}><span className={styles.stepTabNum}>3</span><span className={styles.stepTabLabel}>Allocate</span></div>
          <div className={styles.stepTab}><span className={styles.stepTabNum}>4</span><span className={styles.stepTabLabel}>Result</span></div>
        </div>
        <div className={styles.wrap}>
          <h2 className={styles.stepTitle}>Who ate what?</h2>
          <p className={styles.stepSubtitle}>Use equal split or enter exact units per person (slices, pieces, cups…)</p>

          {items.map((item, i) => {
            const mode = getItemMode(i);
            const checked = getCheckedMembers(i);
            // preview share per checked member
            const itemTotal = item.qty * item.price;
            return (
              <div key={i} className={styles.allocCard}>
                <div className={styles.allocCardHeader}>
                  <span className={styles.allocItemName}>{item.name}</span>
                  <div className={styles.allocModeBtns}>
                    <button
                      className={`${styles.allocModeBtn} ${mode === 'equal' ? styles.allocModeBtnActive : ''}`}
                      onClick={() => setItemMode(i, 'equal')}
                    >Equal</button>
                    <button
                      className={`${styles.allocModeBtn} ${mode === 'units' ? styles.allocModeBtnActive : ''}`}
                      onClick={() => setItemMode(i, 'units')}
                    >Units</button>
                  </div>
                </div>
                <p className={styles.allocItemPrice}>{fmt(itemTotal)}</p>

                <div className={styles.allocGrid}>
                  {members.map((m, mi) => {
                    const a = getAlloc(i, m);
                    const isChecked = a.checked !== false;
                    // compute this person's share for preview
                    let shareAmt = 0;
                    if (isChecked) {
                      if (mode === 'units') {
                        const totalUnits = checked.reduce((s, cm) => s + (getAlloc(i, cm).units || 1), 0);
                        shareAmt = totalUnits > 0 ? itemTotal * ((a.units || 1) / totalUnits) : 0;
                      } else {
                        shareAmt = checked.length > 0 ? itemTotal / checked.length : 0;
                      }
                    }
                    const pct = itemTotal > 0 ? Math.round((shareAmt / itemTotal) * 100) : 0;
                    return (
                      <div key={m} className={styles.allocCell} onClick={() => toggleMemberItem(i, m)}>
                        <div
                          className={styles.allocAvatar}
                          style={{ background: avatarColor(mi), opacity: isChecked ? 1 : 0.25 }}
                        >
                          {m[0].toUpperCase()}
                        </div>
                        <span className={`${styles.allocCellName} ${!isChecked ? styles.allocCellNameOff : ''}`}>
                          {m}
                        </span>
                        <div className={`${styles.allocCheck} ${isChecked ? styles.allocCheckOn : ''}`}>
                          {isChecked && <svg width="8" height="8" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none"/></svg>}
                        </div>
                        {isChecked && mode === 'units' ? (
                          <div className={styles.allocUnitsWrap} onClick={(e) => e.stopPropagation()}>
                            <input
                              className={styles.allocUnitsInput}
                              type="number"
                              min="0"
                              value={a.units || 1}
                              onChange={(e) => setAllocUnits(i, m, e.target.value)}
                            />
                            <span className={styles.allocUnitLabel}>units</span>
                          </div>
                        ) : (
                          <span className={styles.allocCellShare}>
                            {isChecked ? `${pct}% · ${fmt(shareAmt)}` : '—'}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className={styles.navRow}>
            <button className={styles.backBtn} onClick={() => setStep(2)}>← Back</button>
            <button className={styles.nextBtn} onClick={() => setStep(4)}>
              Calculate splits →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 4 — Results
  if (step === 4) {
    const { totals, svcAmt, taxAmt, total, breakdown } = calcResults();
    return (
      <div className={styles.pageWrap}>
        <div className={styles.topBar}>
          <div className={styles.topBarInner}>
            <div className={styles.topBarLogo}>
              <div className={styles.logoIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="3" width="18" height="18" rx="3" fill="white" opacity="0.9"/>
                  <path d="M7 8h10M7 12h7M7 16h5" stroke="#111" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <span className={styles.topBarLogoText}>SplitBill</span>
            </div>
            <span className={styles.topBarSub}>fair splits, zero drama</span>
          </div>
        </div>
        <div className={styles.stepTabs}>
          <div className={styles.stepTab}><span className={styles.stepTabNum}>1</span><span className={styles.stepTabLabel}>Receipt</span></div>
          <div className={styles.stepTab}><span className={styles.stepTabNum}>2</span><span className={styles.stepTabLabel}>Members</span></div>
          <div className={styles.stepTab}><span className={styles.stepTabNum}>3</span><span className={styles.stepTabLabel}>Allocate</span></div>
          <div className={`${styles.stepTab} ${styles.stepTabActive}`}><span className={styles.stepTabNum}>4</span><span className={styles.stepTabLabel}>Result</span></div>
        </div>
        <div className={styles.wrap}>
          <h2 className={styles.stepTitle}>Here's who pays what</h2>

          {/* 2-column summary grid */}
          <div className={styles.resultSummaryGrid}>
            {members.map((m, mi) => (
              <div key={m} className={styles.resultSummaryCard}>
                <div className={styles.resultSummaryAvatar} style={{ background: avatarColor(mi) }}>
                  {m[0].toUpperCase()}
                </div>
                <span className={styles.resultSummaryName}>{m}</span>
                <span className={styles.resultSummaryAmt}>{fmt(totals[m])}</span>
              </div>
            ))}
          </div>

          {/* Per-person itemized breakdown */}
          {members.map((m, mi) => {
            const bd = breakdown[m];
            return (
              <div key={m} className={styles.resultBreakdownCard}>
                <div className={styles.resultBreakdownHeader}>
                  <div className={styles.resultBreakdownAvatar} style={{ background: avatarColor(mi) }}>
                    {m[0].toUpperCase()}
                  </div>
                  <span className={styles.resultBreakdownName}>{m}</span>
                  <span className={styles.resultBreakdownTotal}>{fmt(totals[m])}</span>
                </div>
                <div className={styles.resultBreakdownItems}>
                  {bd.map((it, j) => (
                    <div key={j} className={styles.resultBreakdownRow}>
                      <span className={styles.resultBreakdownItemName}>{it.name} ×{it.qty}</span>
                      <span className={styles.resultBreakdownItemAmt}>{fmt(it.share)}</span>
                    </div>
                  ))}
                  {bd._svcShare > 0 && (
                    <div className={styles.resultBreakdownRow}>
                      <span className={styles.resultBreakdownChargeName}>Service charge</span>
                      <span className={styles.resultBreakdownItemAmt}>{fmt(bd._svcShare)}</span>
                    </div>
                  )}
                  {bd._taxShare > 0 && (
                    <div className={styles.resultBreakdownRow}>
                      <span className={styles.resultBreakdownChargeName}>Tax (PPN)</span>
                      <span className={styles.resultBreakdownItemAmt}>{fmt(bd._taxShare)}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Saweria tip jar */}
          <div className={styles.saweriaBox}>
            <p className={styles.saweriaText}>
              SplitBill is free forever. If it saved you an awkward conversation, buy the founder a coffee ☕
            </p>
            <a
              href="https://saweria.co/splitbill"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.saweriaBtn}
            >
              Support via Saweria
            </a>
          </div>

          <div className={styles.navRow}>
            <button className={styles.backBtn} onClick={() => setStep(3)}>← Back</button>
            <button className={styles.copyBtn2} onClick={copyResults}>
              📋 Copy summary
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
