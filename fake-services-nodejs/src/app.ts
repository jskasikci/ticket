const { v4: uuidv4 } = require('uuid');
const { ZBClient } = require('zeebe-node');
const express = require('express');
const AWS = require('aws-sdk');
const amqp = require('amqplib/callback_api');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

////////////////////////////////////
// AWS LAMBDA CLIENT
////////////////////////////////////
const lambda = new AWS.Lambda({
  region: 'eu-central-1',
});

////////////////////////////////////
// ZEEBE CLIENT CONFIGURATION
////////////////////////////////////
const zeebeClient = new ZBClient({
  gatewayAddress: 'localhost:26500',
  useTLS: false,
  loglevel: 'DEBUG',
});

////////////////////////////////////
// FAKE SEAT RESERVATION WORKER (Uses Lambda)
////////////////////////////////////
zeebeClient.createWorker('reserve-seats', async (job) => {
  console.log('\n\n[Reservation] Starting...');
  
  const seatIds = job.variables.seatIds || ["1A"];
  console.log('Reserving seats:', seatIds);

  try {
    const res = await lambda.invoke({
      FunctionName: 'reserveSeatDynamo',
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({ seats: seatIds }),
    }).promise();

    const lambdaResponse = JSON.parse(res.Payload);
    console.log('Reservation response:', lambdaResponse);

    if (lambdaResponse.statusCode === 200) {
      const numericalIds = lambdaResponse.body.seatIds || [];
      
      return job.complete({ 
        reservationId: uuidv4(),
        reservedSeats: numericalIds
      });
    }
    return job.error('ReservationFailed');
  } catch (error) {
    console.error('Reservation error:', error);
    return job.error('ReservationFailed');
  }
});

////////////////////////////////////
// PAYMENT WORKER (Integrating with RabbitMQ for communication)
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

    channel.consume(queuePaymentRequest, async function (inputMessage) {
      const paymentRequestId = inputMessage.content.toString();
      const paymentConfirmationId = uuidv4();

      console.log("\n\n[x] Received payment request %s", paymentRequestId);

      const seatIds = inputMessage.properties.headers.seatIds || [];
      console.log('Payment for seat IDs:', seatIds);

      try {
        const lambdaResponse = await lambda.invoke({
          FunctionName: 'processPaymentDynamo',
          InvocationType: 'RequestResponse',
          Payload: JSON.stringify({
            userId: 1,
            seatIds: seatIds,
            payment: true
          }),
        }).promise();

        const lambdaResult = JSON.parse(lambdaResponse.Payload);
        console.log('Lambda response:', lambdaResult);

        if (lambdaResult.statusCode === 200) {
          const outputMessage = JSON.stringify({
            paymentRequestId: paymentRequestId,
            paymentConfirmationId: paymentConfirmationId,
          });

          console.log("Sending payment confirmation:", outputMessage);
          channel.sendToQueue(queuePaymentResponse, Buffer.from(outputMessage));
        } else {
          const errorLog = `Payment failed: ${lambdaResult.body.message}`;
          console.error(errorLog);
        }
      } catch (error) {
        const errorLog = `Error invoking Lambda function: ${error}`;
        console.error(errorLog);
      }
    }, { noAck: true });
  });
});

////////////////////////////////////
// TICKET SERVICE (Same as before)
////////////////////////////////////
const app = express();
app.listen(3000, () => console.log('HTTP Server running on port 3000'));

app.get('/ticket', (req, res) => {
  const ticketId = uuidv4();
  console.log('\n\n [x] Create Ticket %s', ticketId);
  res.json({ ticketId: ticketId });
});