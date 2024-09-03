const up = async (db)=>{
  await db.createCollection('timers');
}

const down = async (db)=>{
  await db.dropCollection('timers');
}

export {up,down};
