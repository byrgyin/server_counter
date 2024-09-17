import express from "express";
import crypto from "crypto";
import { nanoid } from "nanoid";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const app = express();

const clientPromise = MongoClient.connect('DB_URI = mongodb+srv://byrgyin:RLQvSzK3FgpEV4dB@cluster0.udpyldq.mongodb.net/users?retryWrites=true&w=majority&appName=Cluster0', {
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
function stringToBoolean(str) {
  if (str === "true") {
    return true;
  } else if (str === "false") {
    return false;
  } else {
    throw new Error("Invalid boolean string");
  }
}
const findUserByUsername = (db, username) => db.collection("users").findOne({ username });
const findUserSessionId = async (db, sessionId) => {
  const session = await db.collection("sessions").findOne({ sessionId }, { projection: { userId: 1 } });

  if (!session) {
    return;
  }
  return db.collection("users").findOne({ _id: new ObjectId(session.userId) });
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
  return { ...newTimer, id };
};

const createHashPassword = (password) => {
  return crypto.createHash("sha256").update(password).digest("hex").trim().replace(/\n/g, "");
};

const deleteSession = async (db, sessionId) => {
  await db.collection("sessions").deleteOne({ sessionId });
};

app.use(express.json());
// app.use(cookieParser());

const auth = () => async (req, res, next) => {
  console.log('auth')
  console.log(req.headers.sessionid)
  if (!req.headers.sessionid) {
    return next();
  }
  const user = await findUserSessionId(req.db, req.headers.sessionid);
  req.user = user;
  req.sessionId = req.headers.sessionid;
  next();
};

/*GET Q */
// app.get("/", auth(), (req, res) => {
//   res.render("index", {
//     user: req.user,
//     authError: req.query.authError === "true" ? "Wrong username or password" : req.query.authError,
//     duplicateError:
//       req.query.duplicateError === "true" ? "A user with that name already exists" : req.query.duplicateError,
//   });
// });
app.get("/", (req, res) => res.send("Express on Vercel"));

app.listen(3000, () => console.log("Server ready on port 3000."));

app.get("/api/timers", auth(), async (req, res) => {
  const { isActive } = req.query;
  const isActiveBool = stringToBoolean(isActive);
  const userId = req.user._id.toString();
  const timers = await req.db.collection("timers").find({ user_id: userId, isActive: isActiveBool }).toArray();

  if (isActive === "true" && timers[0]) {
    const updates = timers.map((timer) => ({
      updateOne: {
        filter: { _id: new ObjectId(timer._id) },
        update: { $set: { progress: Date.now() - timer.start } },
      },
    }));
    await req.db.collection("timers").bulkWrite(updates);
  }
  res.json(timers.sort((a, b) => a.description.localeCompare(b.description)));
});

app.get("/api/timers/:id",auth(),async (req,res)=>{
  const userId = req.user._id.toString();
  const {id} = req.params;
  const timers = await req.db.collection("timers").find({ _id:new ObjectId(id),user_id: userId }).toArray();
  res.json(timers);
});
/*END GET Q */

/*POST Q */
app.post("/api/timers", auth(), async (req, res) => {
  const { description } = req.body;
  const newTimer = {
    user_id: req.user._id.toString(),
    start: Date.now(),
    end: 0,
    duration: 0,
    progress: 0,
    description: description,
    isActive: true,
  };
  await createTimer(req.db, newTimer);
  res.json(newTimer);
});
/*d*/
app.post("/api/timers/:id/stop", auth(), async (req, res) => {
  const userId = req.user._id.toString();
  const timer = await req.db.collection("timers").findOne({ user_id: userId, isActive: true });
  if (!timer) {
    return res.status(404).send("Timer not found");
  }

  timer.isActive = false;
  timer.end = Date.now();
  timer.duration = timer.end - timer.start;

  await req.db.collection("timers").updateOne({ _id: new ObjectId(timer._id) }, { $set: timer });
  res.json(timer);
});

app.get("/logout", auth(), async (req, res) => {
  if (!req.user) {
    return res.redirect("/");
  }
  await deleteSession(req.db, req.sessionId);
  res.json({});
});

app.post("/login", async (req, res) => {
  // const { username, password } = req.body;
  const { username, password } = req.headers;
  console.log(username);
  console.log(password);

  const hashPW = createHashPassword(password);
  const user = await findUserByUsername(req.db, username);
  console.log(user)

  if (!user || user.password !== hashPW) {
    return res.redirect("/?authError=true");
  }
  const userIdString = user._id.toString();
  const sessionId = await createSession(req.db, userIdString);
  res.setHeader('sessionId',`${sessionId}`);
  res.send('Headers received');
});

app.post("/signup", async (req, res) => {
  const { username, password } = req.headers;
  const user = await findUserByUsername(req.db, username);
  if (user && user.username === username) {
    return res.redirect("/?duplicateError=true");
  } else {
    const hashPW = createHashPassword(password);
    const newUser = {
      username: username,
      password: hashPW,
    };
    const { insertedId } = await createUser(req.db, newUser);
    const sessionId = await createSession(req.db, insertedId.toString());
    res.setHeader('sessionId',`${sessionId}`);
    res.send('Headers received');
    console.log(username);
    console.log(password);
    // res.json({ sessionId })
  }
});
/*ENDasdsadsa POST Q */

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});
/*dsfsdjdfs*/
