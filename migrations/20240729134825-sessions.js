const up = async (db)=>{
  await db.createCollection('sessions');
}

const down = async (db)=>{
  await db.dropCollection('sessions');
}

export {up,down};
