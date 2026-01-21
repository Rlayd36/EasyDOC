package com.easydoc;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.ComponentScan;

@SpringBootApplication
@ComponentScan(basePackages="com.easydoc")
public class BackendSpringApplication {
    public static void main(String[] args) {
        SpringApplication.run(BackendSpringApplication.class, args);
    }
}
