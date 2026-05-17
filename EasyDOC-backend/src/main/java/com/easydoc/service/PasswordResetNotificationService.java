package com.easydoc.service;

import jakarta.mail.internet.AddressException;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;

@Service
public class PasswordResetNotificationService {

	private static final Logger log = LoggerFactory.getLogger(PasswordResetNotificationService.class);
	private static final String FROM_DISPLAY_NAME = "EasyDOC";

	private final ObjectProvider<JavaMailSender> mailSenderProvider;

	@Value("${app.mail.enabled:false}")
	private boolean mailEnabled;

	@Value("${app.password-reset.mail-from:}")
	private String fromAddress;

	@Value("${spring.mail.username:}")
	private String mailUsername;

	@Value("${app.password-reset.frontend-base-url}")
	private String frontendBaseUrl;

	public PasswordResetNotificationService(ObjectProvider<JavaMailSender> mailSenderProvider) {
		this.mailSenderProvider = mailSenderProvider;
	}

	public void sendResetLink(String toEmail, String token) {
		String link = buildResetLink(token);
		if (!mailEnabled) {
			log.info("[비밀번호 재설정] MAIL_ENABLED=false — 메일 대신 링크를 로그로만 출력합니다. to={} link={}", toEmail, link);
			return;
		}

		JavaMailSender sender = mailSenderProvider.getIfAvailable();
		if (sender == null) {
			throw new IllegalStateException("MAIL_ENABLED=true 인데 JavaMailSender 빈이 없습니다.");
		}
		if (mailUsername == null || mailUsername.isBlank()) {
			throw new IllegalStateException("MAIL_USERNAME(spring.mail.username)을 설정하세요.");
		}

		sendSmtp(sender, toEmail, link);
	}

	private String buildResetLink(String token) {
		String base = frontendBaseUrl.trim().replaceAll("/+$", "");
		return base + "/?resetToken=" + token;
	}

	private InternetAddress resolveFromAddress() throws AddressException {
		String fromEmail = fromAddress != null ? fromAddress.trim() : "";
		if (fromEmail.isBlank()) {
			fromEmail = mailUsername.trim();
		}
		// Gmail SMTP: 인증 계정과 From 주소가 일치해야 함
		if (!fromEmail.equalsIgnoreCase(mailUsername.trim())) {
			fromEmail = mailUsername.trim();
		}
		try {
			return new InternetAddress(fromEmail, FROM_DISPLAY_NAME, StandardCharsets.UTF_8.name());
		} catch (UnsupportedEncodingException e) {
			throw new AddressException(e.getMessage());
		}
	}

	private void sendSmtp(JavaMailSender sender, String toEmail, String link) {
		try {
			MimeMessage message = sender.createMimeMessage();
			MimeMessageHelper helper = new MimeMessageHelper(
					message,
					MimeMessageHelper.MULTIPART_MODE_NO,
					StandardCharsets.UTF_8.name());
			helper.setFrom(resolveFromAddress());
			helper.setTo(toEmail);
			helper.setSubject("[EasyDOC] 비밀번호 재설정");
			helper.setText(
					"비밀번호를 재설정하려면 아래 링크를 30분 이내에 열어주세요.\n\n"
							+ link
							+ "\n\n본인이 요청하지 않았다면 이 메일을 무시하시면 됩니다.",
					false);
			sender.send(message);
			log.info("[비밀번호 재설정] 메일 발송 완료 to={}", toEmail);
		} catch (Exception e) {
			log.error("[비밀번호 재설정] 메일 발송 실패 to={}: {}", toEmail, e.getMessage(), e);
			throw new RuntimeException("비밀번호 재설정 메일 발송에 실패했습니다.", e);
		}
	}
}
