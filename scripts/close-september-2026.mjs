import postgres from 'postgres';
const db = postgres(process.env.DATABASE_URL, { max: 1 });
const incomeItems = [{source:'BoothyCall',amount:63767122},{source:'TENS',amount:6875340},{source:'Project Nabil',amount:2000000},{source:'PWC',amount:3000000}];
try {
  await db.begin(async sql => {
    const [asset] = await sql`select id,current_value from assets where name='Bank Jago' and is_active=true for update`;
    if (!asset) throw new Error('Bank Jago missing');
    const [snapshot] = await sql`select current_value from asset_value_snapshots where asset_id=${asset.id} and snapshot_date='2026-10-01' for update`;
    if (!snapshot || ![6664835,13540175].includes(Number(snapshot.current_value))) throw new Error('Unexpected October Jago balance; refusing to overwrite');
    const [existing] = await sql`select income_items from monthly_closings where month='2026-09-01' for update`;
    if (existing && JSON.stringify(existing.income_items) !== JSON.stringify(incomeItems)) {
      // JSONB key order is not stable; compare fields explicitly.
      if (existing.income_items.length !== incomeItems.length || existing.income_items.some((x,i)=>x.source!==incomeItems[i].source || x.amount!==incomeItems[i].amount)) throw new Error('Conflicting monthly close');
    }
    if (Number(snapshot.current_value) === 6664835) {
      await sql`update asset_value_snapshots set current_value=13540175,notes=concat_ws(E'\n',notes,'September close correction: TENS income Rp6,875,340 added once.') where asset_id=${asset.id} and snapshot_date='2026-10-01'`;
      await sql`update assets set current_value=13540175,updated_at=now(),last_updated_at=now() where id=${asset.id} and not exists(select 1 from asset_value_snapshots where asset_id=${asset.id} and snapshot_date > '2026-10-01')`;
      await sql`insert into change_logs (entity_type,entity_id,category,action,changes,label,changed_by) values ('asset',${asset.id},'cash','update',${sql.json({snapshotDate:{before:'2026-10-01',after:'2026-10-01'},currentValue:{before:'6664835',after:'13540175'},septemberIncomeItems:{before:existing?.income_items ?? null,after:incomeItems}})},'Bank Jago — September close, TENS income correction','OWNER')`;
    }
    await sql`insert into monthly_closings (month,income_items,notes) values ('2026-09-01',${sql.json(incomeItems)},'Owner-reported income. Saving = October 1 net worth minus September 1 net worth. Estimated expense = income minus saving. Income is not added to bank balances automatically.') on conflict (month) do nothing`;
    console.log(JSON.stringify({jago:13540175,incomeItems,income:incomeItems.reduce((s,x)=>s+x.amount,0),mode:process.argv.includes('--apply')?'saved':'dry run'}));
    if (!process.argv.includes('--apply')) throw new Error('ROLLBACK_DRY_RUN');
  });
} catch(error) { if (error.message !== 'ROLLBACK_DRY_RUN') throw error; }
finally { await db.end(); }
