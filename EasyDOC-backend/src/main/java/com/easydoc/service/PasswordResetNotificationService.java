package com.easydoc.service;

import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;

@Service
public class PasswordResetNotificationService {

	private static final Logger log = LoggerFactory.getLogger(PasswordResetNotificationService.class);

	private final ObjectProvider<JavaMailSender> mailSenderProvider;

	@Value("${app.mail.enabled:false}")
	private boolean mailEnabled;

	@Value("${app.password-reset.mail-from:}")
	private String fromAddress;

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
		if (fromAddress == null || fromAddress.isBlank()) {
			throw new IllegalStateException("MAIL_FROM(발신자)을 설정하세요. 예: EasyDOC <your@gmail.com>");
		}

		sendSmtp(sender, toEmail, link);
	}

	private String buildResetLink(String token) {
		String base = frontendBaseUrl.trim().replaceAll("/+$", "");
		return base + "/?resetToken=" + token;
	}

	private void sendSmtp(JavaMailSender sender, String toEmail, String link) {
		try {
			MimeMessage message = sender.createMimeMessage();
			MimeMessageHelper helper = new MimeMessageHelper(
					message,
					MimeMessageHelper.MULTIPART_MODE_NO,
					StandardCharsets.UTF_8.name());
			helper.setFrom(fromAddress.trim());
			helper.setTo(toEmail);
			helper.setSubject("[EasyDOC] 비밀번호 재설정");
			helper.setText(
					"비밀번호를 재설정하려면 아래 링크를 30분 이내에 열어주세요.\n\n"
							+ link
							+ "\n\n본인이 요청하지 않았다면 이 메일을 무시하시면 됩니다.",
					false);
			sender.send(message);
		} catch (Exception e) {
			throw new RuntimeException("비밀번호 재설정 메일 발송에 실패했습니다.", e);
		}
	}
}

