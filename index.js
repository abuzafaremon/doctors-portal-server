const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello from Doctors Portal')
})


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.pl6dy.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: 'UnAuthorized Access' })
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: 'Forbidden access' })
    }
    req.decoded = decoded;
    next();
  })
}

async function run() {
  try {
    await client.connect();
    const serviceCollection = client.db('Doctors_Portal').collection('services');
    const bookingCollection = client.db('Doctors_Portal').collection('bookings');
    const userCollection = client.db('Doctors_Portal').collection('users');
    const doctorCollection = client.db('Doctors_Portal').collection('doctors');

    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({ email: requester });
      if (requesterAccount.role === 'admin') {
        next();
      }
      else {
        res.status(403).send({ message: 'Forbidden' });
      }
    }

    app.get('/services', async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query).project({ name: 1 });
      const services = await cursor.toArray();
      res.send(services);
    });

    app.get('/users', verifyJWT, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    })

    app.get('/admin/:email', async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user.role === 'admin';
      res.send({ admin: isAdmin });
    })

    app.put('/user/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const updateDoc = {
        $set: { role: 'admin' },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    })


    app.put('/user/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1d'
      })
      res.send({ result, token });
    })

    app.get('/available', async (req, res) => {
      const date = req.query.date;
      // step 1: get all services
      const services = await serviceCollection.find().toArray();
      // step 2: get the booking of that day
      const query = { date: date };
      const bookings = await bookingCollection.find(query).toArray();
      // step 3: for each service
      services.forEach(service => {
        // step 4: find bookings for that services
        const serviceBookings = bookings.filter(book => book.treatment === service.name);
        // step 5: select slot for the service bookings:
        const bookedSlots = serviceBookings.map(book => book.slot);
        // step 6: select those slots that are not in bookedSlots
        const available = service.slots.filter(slot => !bookedSlots.includes(slot));
        service.slots = available;
      })
      res.send(services);
    })

    /**
         * API Naming Convention
         * app.get('/booking) // get all bookings in this collection. or get more than one or by filter
         * app.get('/booking/:id) // get a specific booking
         * app.post('/booking') // add a new booking
         * app.patch('/booking/:id') //
         * app.delete('/booking/:id') //
         */
    app.get('/booking', verifyJWT, async (req, res) => {
      const patient = req.query.patient;
      const decodedEmail = req.decoded.email;
      if (patient === decodedEmail) {
        const query = { patient: patient };
        const bookings = await bookingCollection.find(query).toArray();
        res.send(bookings);
      }
      else {
        return res.status(403).send({ message: 'Forbidden access' })
      }
    })

    app.get('/booking/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const booking = await bookingCollection.findOne(query);
      res.send(booking);
    })

    app.post('/booking', async (req, res) => {
      const booking = req.body;
      const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
      const exist = await bookingCollection.findOne(query);
      if (exist) {
        return res.send({ success: false, booking: exist })
      }
      const result = await bookingCollection.insertOne(booking);
      return res.send({ success: true, result });
    })

    app.get('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
      const doctors = await doctorCollection.find().toArray();
      res.send(doctors);
    })

    app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
      const doctor = req.body;
      const result = await doctorCollection.insertOne(doctor);
      res.send(result);
    })
    app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email }
      const result = await doctorCollection.deleteOne(filter)
      res.send(result);
    })

  }
  finally {

  }
}
run().catch(console.dir);


app.listen(port, () => {
  console.log(`Doctors Portal listening on port ${port}`)
})