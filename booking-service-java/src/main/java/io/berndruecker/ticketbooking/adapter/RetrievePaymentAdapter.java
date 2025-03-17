package io.berndruecker.ticketbooking.adapter;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import io.berndruecker.ticketbooking.ProcessConstants;
import io.camunda.zeebe.client.api.response.ActivatedJob;
import io.camunda.zeebe.spring.client.annotation.JobWorker;

@Component
public class RetrievePaymentAdapter {
  
  private Logger logger = LoggerFactory.getLogger(RetrievePaymentAdapter.class);
  
  public static String RABBIT_QUEUE_NAME = "paymentRequest";
  
  @Autowired
  protected RabbitTemplate rabbitTemplate;
  
  @JobWorker(type = "retrieve-payment")
  public Map<String, Object> retrievePayment(final ActivatedJob job) {
      logger.info("Send message to retrieve payment [" + job + "]");
      
      ArrayList<String> reservedSeats = (ArrayList<String>) job.getVariablesAsMap().get("reservedSeats");

      if (reservedSeats == null || reservedSeats.isEmpty()) {
          logger.error("No reserved seats found.");
          return Collections.singletonMap("error", "No seats reserved");
      }
      
      String paymentRequestId = UUID.randomUUID().toString();
      
      rabbitTemplate.convertAndSend(RABBIT_QUEUE_NAME, paymentRequestId, message -> {
          message.getMessageProperties().setHeader("seatIds", reservedSeats);
          return message;
      });
      
      return Collections.singletonMap(ProcessConstants.VAR_PAYMENT_REQUEST_ID, paymentRequestId);
  }
}
