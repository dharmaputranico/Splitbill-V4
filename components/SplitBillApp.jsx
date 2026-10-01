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

  // ─── Allocation helpers ────────────────────────────────────────
  function getAlloc(itemIdx, member) {
    return allocs[itemIdx]?.[member] || { mode: 'equal', units: 1 };
  }

  function setAllocMode(itemIdx, member, mode) {
    setAllocs((prev) => ({
      ...prev,
      [itemIdx]: {
        ...prev[itemIdx],
        [member]: { ...getAlloc(itemIdx, member), mode },
      },
    }));
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

  function setAllEqual(itemIdx) {
    const next = {};
    members.forEach((m) => {
      next[m] = { mode: 'equal', units: 1 };
    });
    setAllocs((prev) => ({ ...prev, [itemIdx]: next }));
  }

  function setAllEqualGlobal() {
    const next = {};
    items.forEach((_, i) => {
      next[i] = {};
      members.forEach((m) => {
        next[i][m] = { mode: 'equal', units: 1 };
      });
    });
    setAllocs(next);
  }

  // ─── Results calculation ───────────────────────────────────────
  function calcResults() {
    const { svcAmt, taxAmt, total } = getCharges();
    const charges = svcAmt + taxAmt;
    const totals = {};
    members.forEach((m) => (totals[m] = 0));

    items.forEach((item, i) => {
      const itemTotal = item.qty * item.price;
      const memberAllocs = members.map((m) => getAlloc(i, m));
      const hasUnits = memberAllocs.some((a) => a.mode === 'units');

      if (hasUnits) {
        const totalUnits = memberAllocs.reduce((s, a) => s + (a.mode === 'units' ? a.units : 1), 0);
        members.forEach((m, mi) => {
          const a = memberAllocs[mi];
          const u = a.mode === 'units' ? a.units : 1;
          totals[m] += itemTotal * (u / totalUnits);
        });
      } else {
        // equal split
        members.forEach((m) => {
          totals[m] += itemTotal / members.length;
        });
      }
    });

    // distribute charges proportionally
    members.forEach((m) => {
      totals[m] += charges * (totals[m] / subtotal);
    });

    return { totals, svcAmt, taxAmt, total };
  }

  // ─── Copy summary ──────────────────────────────────────────────
  function copyResults() {
    const { totals, svcAmt, taxAmt, total } = calcResults();
    let text = '🧾 Bill Split — splitbill.co.id\n\n';
    members.forEach((m) => {
      text += `${m}: ${fmt(totals[m])}\n`;
    });
    text += `\nSubtotal: ${fmt(subtotal)}\n`;
    text += `Service: ${fmt(svcAmt)}\n`;
    text += `Tax: ${fmt(taxAmt)}\n`;
    text += `Total: ${fmt(total)}\n`;
    text += '\nSplit fairly with SplitBill 🍽️';
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

        <button className={styles.globalEqualBtn} onClick={setAllEqualGlobal}>
          Split everything equally
        </button>

        {items.map((item, i) => (
          <div key={i} className={styles.allocCard}>
            <div className={styles.allocCardHeader}>
              <span className={styles.allocItemName}>{item.name}</span>
              <span className={styles.allocItemTotal}>{fmt(item.qty * item.price)}</span>
            </div>

            <button className={styles.equalBtn} onClick={() => setAllEqual(i)}>
              Equal split
            </button>

            <div className={styles.allocMembers}>
              {members.map((m) => {
                const a = getAlloc(i, m);
                return (
                  <div key={m} className={styles.allocMemberRow}>
                    <span className={styles.allocMemberAvatar}>{m[0].toUpperCase()}</span>
                    <span className={styles.allocMemberName}>{m}</span>
                    <button
                      className={`${styles.modeBtn} ${a.mode === 'equal' ? styles.modeBtnActive : ''}`}
                      onClick={() => setAllocMode(i, m, 'equal')}
                    >Equal</button>
                    <button
                      className={`${styles.modeBtn} ${a.mode === 'units' ? styles.modeBtnActive : ''}`}
                      onClick={() => setAllocMode(i, m, 'units')}
                    >Units</button>
                    {a.mode === 'units' && (
                      <input
                        className={styles.unitsInput}
                        type="number"
                        min="0"
                        value={a.units}
                        onChange={(e) => setAllocUnits(i, m, e.target.value)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div className={styles.navRow}>
          <button className={styles.backBtn} onClick={() => setStep(2)}>← Back</button>
          <button className={styles.nextBtn} onClick={() => setStep(4)}>
            See results →
          </button>
        </div>
        </div>
      </div>
    );
  }

  // Step 4 — Results
  if (step === 4) {
    const { totals, svcAmt, taxAmt, total } = calcResults();
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

        <div className={styles.resultCards}>
          {members.map((m) => (
            <div key={m} className={styles.resultCard}>
              <span className={styles.resultAvatar}>{m[0].toUpperCase()}</span>
              <span className={styles.resultName}>{m}</span>
              <span className={styles.resultAmt}>{fmt(totals[m])}</span>
            </div>
          ))}
        </div>

        <div className={styles.summaryBox}>
          <div className={styles.summaryRow}>
            <span>Subtotal</span>
            <span>{fmt(subtotal)}</span>
          </div>
          <div className={styles.summaryRow}>
            <span>Service</span>
            <span>{fmt(svcAmt)}</span>
          </div>
          <div className={styles.summaryRow}>
            <span>Tax (PPN)</span>
            <span>{fmt(taxAmt)}</span>
          </div>
          <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
            <span>Total</span>
            <span>{fmt(total)}</span>
          </div>
        </div>

        <button className={styles.copyBtn} onClick={copyResults}>
          📋 Copy summary
        </button>

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
          <button className={styles.backBtn} onClick={() => setStep(3)}>← Adjust</button>
          <button className={styles.nextBtn} onClick={() => {
            setStep(1);
            setItems([]);
            setMembers([]);
            setAllocs({});
          }}>
            New split
          </button>
        </div>
        </div>
      </div>
    );
  }

  return null;
}
