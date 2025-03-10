package io.berndruecker.ticketbooking;

import org.springframework.amqp.core.Queue;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.web.client.RestTemplate;

import io.camunda.zeebe.spring.client.EnableZeebeClient;
import io.camunda.zeebe.spring.client.annotation.Deployment;

@SpringBootApplication
@EnableZeebeClient
@Deployment(resources = { "classpath:ticket-booking.bpmn" })
public class TicketBookingApplication {

    public static void main(String[] args) {
        SpringApplication.run(TicketBookingApplication.class, args);
    }

    // Bean for RestTemplate to make HTTP requests
    @Bean
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }

    // Bean for RabbitMQ queue
    @Bean
    public Queue paymentResponseQueue() {
        return new Queue("paymentResponse", true);
    }
}