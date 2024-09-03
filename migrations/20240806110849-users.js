const up = async (db)=>{
  await db.createCollection('users');
}

const down = async (db)=>{
  await db.dropCollection('users');
}

export {up,down};
