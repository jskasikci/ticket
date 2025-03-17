package io.berndruecker.ticketbooking.rest;

import java.util.HashMap;
import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ServerWebExchange;

import io.berndruecker.ticketbooking.ProcessConstants;
import io.berndruecker.ticketbooking.adapter.RetrievePaymentAdapter;
import io.camunda.zeebe.client.ZeebeClient;
import io.camunda.zeebe.client.api.ZeebeFuture;
import io.camunda.zeebe.client.api.command.ClientStatusException;
import io.camunda.zeebe.client.api.response.ProcessInstanceResult;
import io.camunda.zeebe.spring.client.EnableZeebeClient;

@SpringBootConfiguration
@RestController
@EnableZeebeClient
public class TicketBookingRestController {

  private Logger logger = LoggerFactory.getLogger(RetrievePaymentAdapter.class);

  @Autowired
  private ZeebeClient client;

  @PutMapping("/ticket")
  public ResponseEntity<BookTicketResponse> bookTicket(
      ServerWebExchange exchange,
      @RequestParam(required = false) List<String> seatIds) { // ✅ Supports multiple seats

    String simulateBookingFailure = exchange.getRequest().getQueryParams().getFirst("simulateBookingFailure");

    // Generate a booking reference ID
    BookTicketResponse response = new BookTicketResponse();
    response.bookingReferenceId = UUID.randomUUID().toString();

    HashMap<String, Object> variables = new HashMap<>();
    variables.put(ProcessConstants.VAR_BOOKING_REFERENCE_ID, response.bookingReferenceId);

    if (seatIds != null && !seatIds.isEmpty()) {
      variables.put(ProcessConstants.VAR_SEAT_ID, seatIds); // ✅ Pass as list
    }

    if (simulateBookingFailure != null) {
      variables.put(ProcessConstants.VAR_SIMULATE_BOOKING_FAILURE, simulateBookingFailure);
    }

    // Start Zeebe workflow
    ZeebeFuture<ProcessInstanceResult> future = client.newCreateInstanceCommand()
        .bpmnProcessId("ticket-booking")
        .latestVersion()
        .variables(variables)
        .withResult() // Wait for the workflow to finish
        .send();

    try {
      // Block until workflow completes
      ProcessInstanceResult workflowInstanceResult = future.join();

      // Retrieve variables after workflow finishes
      response.reservationId = (String) workflowInstanceResult.getVariablesAsMap().get(ProcessConstants.VAR_RESERVATION_ID);
      response.paymentConfirmationId = (String) workflowInstanceResult.getVariablesAsMap().get(ProcessConstants.VAR_PAYMENT_CONFIRMATION_ID);
      response.ticketId = (String) workflowInstanceResult.getVariablesAsMap().get(ProcessConstants.VAR_TICKET_ID);

      return ResponseEntity.status(HttpStatus.OK).body(response);
    } catch (ClientStatusException ex) {
      logger.error("Timeout on waiting for workflow");

      return ResponseEntity.status(HttpStatus.ACCEPTED).build();
    }
  }

  public static class BookTicketResponse {
    public String reservationId;
    public String paymentConfirmationId;
    public String ticketId;   
    public String bookingReferenceId;

    public boolean isSuccess() {
      return (ticketId != null);
    }
  }
}