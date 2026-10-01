import postgres from 'postgres';
const db = postgres(process.env.DATABASE_URL, { max: 1 });
const apply = process.argv.includes('--apply');
const overrides = { BCA:153432700, BNI:1111995, 'Bank Jago':6664835, Mandiri:18926414, 'Cash on Hand':300000, GoPay:40000, 'Project Nabil':80000000, 'Project Tante Asti':304000000 };
const reclass = new Set(['Project Nabil','Project Tante Asti']);
try {
  await db.begin(async sql => {
    const existing = await sql`select id from asset_value_snapshots where snapshot_date >= '2026-10-01' limit 1`;
    if (existing.length) throw new Error('October or later snapshots exist; refusing to overwrite.');
    const rows = await sql`select a.*, s.current_value as previous_value, s.capital_contributed, s.valuation_method from assets a join lateral (select * from asset_value_snapshots where asset_id=a.id and snapshot_date < '2026-10-01' order by snapshot_date desc limit 1) s on true where a.is_active=true`;
    if (rows.length !== 24 || new Set(rows.map(r=>r.name)).size !== 24) throw new Error('Unexpected asset inventory');
    const totals = {};
    for (const row of rows) {
      const value = overrides[row.name] ?? Number(row.previous_value);
      const category = reclass.has(row.name) ? 'receivable' : row.category;
      totals[category] = (totals[category] ?? 0) + value;
      const notes = reclass.has(row.name) ? 'Owner October report: classified as accounts receivable.' : 'Owner October report; unchanged values carried forward from September.';
      await sql`insert into asset_value_snapshots (asset_id,snapshot_date,current_value,capital_contributed,valuation_method,source,notes,category_at_date) values (${row.id},'2026-10-01',${value},${row.capital_contributed},${row.valuation_method},'manual',${notes},${category})`;
      await sql`update assets set current_value=${value},category=${category},subcategory=${reclass.has(row.name) ? 'personal_receivable' : row.subcategory},last_updated_at=now(),updated_at=now() where id=${row.id}`;
      await sql`insert into change_logs (entity_type,entity_id,category,action,changes,label,changed_by) values ('asset',${row.id},${category},'update',${sql.json({ snapshotDate:{before:null,after:'2026-10-01'},currentValue:{before:row.previous_value,after:String(value)},category:{before:row.category,after:category} })},${row.name},'OWNER via October report')`;
    }
    await sql`insert into payable_snapshots (creditor,snapshot_date,amount,notes) values ('Nenek','2026-10-01',120000000,'Funds entrusted for business/project management; already included in reported bank/assets. Do not add cash again.')`;
    const gross = Object.values(totals).reduce((a,b)=>a+b,0);
    if (gross !== 1328600900 || totals.cash !== 180475944 || totals.receivable !== 424000000) throw new Error('Reconciliation failed');
    console.log(JSON.stringify({apply,totals,totalAssets:gross,accountsPayable:120000000,netWorth:gross-120000000},null,2));
    if (!apply) throw new Error('DRY_RUN_ROLLBACK');
  });
} catch (error) {
  if (error.message !== 'DRY_RUN_ROLLBACK') throw error;
  console.log('Dry run verified; transaction rolled back.');
} finally { await db.end(); }
