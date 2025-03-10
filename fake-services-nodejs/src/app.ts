const { v4: uuidv4 } = require('uuid');
const { ZBClient } = require('zeebe-node');
const amqp = require('amqplib/callback_api');
const express = require('express');
require('dotenv').config();

////////////////////////////////////
// ZEEBE CLIENT CONFIGURATION
////////////////////////////////////
const zeebeClient = new ZBClient({
  gatewayAddress: 'localhost:26500', 
  useTLS: false,
  loglevel: 'DEBUG',
});

// Test Zeebe connection
zeebeClient.topology()
  .then(topology => {
    console.log('Connected to Zeebe broker:', topology);
  })
  .catch(error => {
    console.error('Failed to connect to Zeebe broker:', error);
  });

////////////////////////////////////
// FAKE SEAT RESERVATION SERVICE
////////////////////////////////////
const worker = zeebeClient.createWorker('reserve-seats', reserveSeatsHandler);

function reserveSeatsHandler(job, _, worker) {
  console.log('\n\nReserve seats now...');
  console.log(job);

  // Simulate reservation logic
  if (job.variables.simulateBookingFailure !== 'seats') {
    console.log('Successful :-)');
    return job.complete({
      reservationId: '1234',
    });
  } else {
    console.log('ERROR: Seats could not be reserved!');
    return job.error('ErrorSeatsNotAvailable');
  }
}

////////////////////////////////////
// FAKE PAYMENT SERVICE
////////////////////////////////////
const queuePaymentRequest = 'paymentRequest';
const queuePaymentResponse = 'paymentResponse';

amqp.connect('amqp://localhost', function (error0, connection) {
  if (error0) {
    throw error0;
  }
  connection.createChannel(function (error1, channel) {
    if (error1) {
      throw error1;
    }

    channel.assertQueue(queuePaymentRequest, { durable: true });
    channel.assertQueue(queuePaymentResponse, { durable: true });

    channel.consume(
      queuePaymentRequest,
      function (inputMessage) {
        const paymentRequestId = inputMessage.content.toString();
        const paymentConfirmationId = uuidv4();

        console.log('\n\n [x] Received payment request %s', paymentRequestId);

        const outputMessage = JSON.stringify({
          paymentRequestId: paymentRequestId,
          paymentConfirmationId: paymentConfirmationId,
        });

        channel.sendToQueue(queuePaymentResponse, Buffer.from(outputMessage));
        console.log(' [x] Sent payment response %s', outputMessage);
      },
      {
        noAck: true,
      }
    );
  });
});

////////////////////////////////////
// FAKE TICKET GENERATION SERVICE
////////////////////////////////////
const app = express();

app.listen(3000, () => {
  console.log('HTTP Server running on port 3000');
});

app.get('/ticket', (req, res) => {
  const ticketId = uuidv4();
  console.log('\n\n [x] Create Ticket %s', ticketId);
  res.json({ ticketId: ticketId });
});