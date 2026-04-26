package com.easydoc.config;

import org.springframework.context.annotation.Configuration;

/**
 * spring-boot-starter-mail 을 추가하면 spring.mail.* 기반의 JavaMailSender 자동 구성이 활성화된다.
 * 실제 발송 여부는 app.mail.enabled 로 {@link com.easydoc.service.PasswordResetNotificationService} 에서 제어한다.
 */
@Configuration
public class MailConfig {}

