import express from 'express';
import crypto from 'crypto';
import {WebSocketServer} from "ws";
import http from "http";
import {nanoid} from 'nanoid';
import {MongoClient, ObjectId} from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({server});

const clientPromise = MongoClient.connect(process.env.DB_URI, {
  maxPoolSize: 10,
});
app.use(async (req, res, next) => {
  try {
    const client = await clientPromise;
    req.db = client.db("users");
    next();
  } catch (err) {
    next(err);
  }
});
const getDb = async () => {
  const client = await clientPromise;
  return client.db("users");
};
const findUserByUsername = (db, username) => db.collection("users").findOne({username});
const findUserSessionId = async (db, sessionId) => {
  const session = await db.collection("sessions").findOne({sessionId}, {projection: {userId: 1}});

  if (!session) {
    return;
  }
  return db.collection("users").findOne({_id: new ObjectId(session.userId)});
};

const createSession = async (db, userId) => {
  if (!userId) {
    throw new Error("userId cannot be null");
  }
  const sessionId = nanoid();
  await db.collection("sessions").insertOne({
    userId: userId,
    sessionId: sessionId,
  });
  return sessionId;
};
const createUser = async (db, user) => await db.collection("users").insertOne(user);
const createTimer = async (db, newTimer) => {
  const id = await db.collection("timers").insertOne(newTimer);
  return {...newTimer, id};
};

const createHashPassword = (password) => {
  return crypto.createHash("sha256").update(password).digest("hex").trim().replace(/\n/g, "");
};

const deleteSession = async (ws, db, sessionId) => {
  await db.collection("sessions").deleteOne({sessionId});
  return ws.send(JSON.stringify({
    type: 'logout_success',
    success: true,
  }));
};

app.use(express.json());


async function getTimers(ws, db, isActive, sessionId) {
  const user = await findUserSessionId(db, sessionId);
  const userId = user._id.toString();
  const timers = await db.collection("timers").find({user_id: userId, isActive: isActive}).toArray();

  if (isActive && timers[0]) {
    const updates = timers.map((timer) => ({
      updateOne: {
        filter: {_id: new ObjectId(timer._id)},
        update: {$set: {progress: Date.now() - timer.start}},
      },
    }));
    await db.collection("timers").bulkWrite(updates);
  }
  if (isActive){
    return ws.send(JSON.stringify({
      type: 'list_active_timer_success',
      success: true,
      sessionId: sessionId,
      timers,
    }));
  } else{
    return ws.send(JSON.stringify({
      type: 'list_old_timer_success',
      success: true,
      sessionId: sessionId,
      timers,
    }));
  }

}

async function createTimerWS(ws, db, description, sessionId) {
  const user = await findUserSessionId(db, sessionId);
  const userId = user._id.toString();
  const newTimer = {
    user_id: userId,
    start: Date.now(),
    end: 0,
    duration: 0,
    progress: 0,
    description: description,
    isActive: true,
  };
  await createTimer(db, newTimer);

  return ws.send(JSON.stringify({
    type: 'create_timer_success',
    success: true,
    sessionId: sessionId,
    newTimer,
  }));
}

async function stopTimer(ws, db, idTimer, sessionId) {
  const user = await findUserSessionId(db, sessionId);
  const userId = user._id.toString();
  const timer = await db.collection("timers").findOne({_id: new ObjectId(idTimer), user_id: userId, isActive: true});

  timer.isActive = false;
  timer.end = Date.now();
  timer.duration = timer.end - timer.start;

  await db.collection("timers").updateOne({_id: new ObjectId(timer._id)}, {$set: timer});
  return ws.send(JSON.stringify({
    type: 'stop_timer_success',
    success: true,
    sessionId: sessionId,
    timer,
  }));
}

async function statusTimer(ws, db, idTimer, sessionId) {
  const user = await findUserSessionId(db, sessionId);
  const userId = user._id.toString();
  const timers = await db.collection("timers").find({_id: new ObjectId(idTimer), user_id: userId}).toArray();

  return ws.send(JSON.stringify({
    type: 'status_timer_success',
    success: true,
    sessionId: sessionId,
    timers,
  }));
}

async function loginAcc(ws,db, data) {
  const {username, password} = data.data;

  const hashPW = createHashPassword(password);
  const user = await findUserByUsername(db, username);

  if (!user || user.password !== hashPW) {
    return ws.send(JSON.stringify({
      type: 'login_error',
      success: false,
    }));
  }

  const userIdString = user._id.toString();
  const sessionId = await createSession(db, userIdString);

  return ws.send(JSON.stringify({
    type: 'login_success',
    success: true,
    sessionId: sessionId
  }));
}

async function signupAcc(ws,db, data) {
  const {username, password} = data.data;
  const user = await findUserByUsername(db, username);

  if (user && user.username === username) {
    return ws.send(JSON.stringify({
      type: 'signup_error',
      success: false,
    }));
  } else {
    const hashPW = createHashPassword(password);
    const newUser = {
      username: username,
      password: hashPW,
    };
    const {insertedId} = await createUser(db, newUser);
    const sessionId = await createSession(db, insertedId.toString());

    return ws.send(JSON.stringify({
      type: 'signup_success',
      success: true,
      sessionId: sessionId,
      user: newUser
    }));
  }
}

const port = process.env.PORT || 3000;

wss.on('connection', async (ws) => {
  const db = await getDb();
  ws.on('message', async (message) => {
    let data;
    try {
      data = JSON.parse(message);

      if (data.type === 'login') {
        await loginAcc(ws, db, data);
      } else if (data.type === 'signup') {
        await signupAcc(ws, db, data);
      } else if (data.type === 'logout') {
        await deleteSession(ws, db, data.sessionId)
      } else if (data.type === 'old_timer') {
        await getTimers(ws, db, data.isActive, data.sessionId);
      } else if (data.type === 'active_timer') {

        await getTimers(ws, db, data.isActive, data.sessionId);

      } else if (data.type === 'create_timer') {
        await createTimerWS(ws, db, data.description, data.sessionId);
      } else if (data.type === 'stop_timer') {
        await stopTimer(ws, db, data.id, data.sessionId)
      } else if (data.type === 'status_timer') {
        await statusTimer(ws, db, data.id, data.sessionId)
      }
    } catch (error) {
      return;
    }
  })
})
server.listen(port, () => {
  console.log(`Listening on wss://localhost:${port}`);
});
