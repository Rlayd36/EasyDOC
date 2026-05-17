package com.easydoc.controller;

import com.easydoc.entity.User;
import com.easydoc.repository.UserRepository;
import com.easydoc.service.UserAccountDeletionService;
import com.easydoc.util.JwtUtil;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@RestController
@CrossOrigin(origins = "http://localhost:5173")
@RequestMapping("/api/users")
public class UserController {

	private final UserRepository userRepository;
	private final PasswordEncoder passwordEncoder;
	private final JwtUtil jwtUtil;
	private final UserAccountDeletionService userAccountDeletionService;

	public UserController(
			UserRepository userRepository,
			PasswordEncoder passwordEncoder,
			JwtUtil jwtUtil,
			UserAccountDeletionService userAccountDeletionService) {
		this.userRepository = userRepository;
		this.passwordEncoder = passwordEncoder;
		this.jwtUtil = jwtUtil;
		this.userAccountDeletionService = userAccountDeletionService;
	}

	@PostMapping("/signup")
	public ResponseEntity<?> signup(@RequestBody User user) {
		if (userRepository.findByEmail(user.getEmail()).isPresent()) {
			return ResponseEntity.badRequest().body("이미 존재하는 이메일입니다.");
		}
		String encodedPassword = passwordEncoder.encode(user.getPassword());
		user.setPassword(encodedPassword);
		userRepository.save(user);
		return ResponseEntity.ok("회원가입 성공!");
	}

	@PostMapping("/login")
	public ResponseEntity<?> login(@RequestBody Map<String, String> loginData) {
		String email = loginData.get("email");
		String password = loginData.get("password");
		User user = userRepository.findByEmail(email).orElse(null);
		if (user == null || !passwordEncoder.matches(password, user.getPassword())) {
			return ResponseEntity.status(401).body("이메일 또는 비밀번호가 잘못되었습니다.");
		}
		String token = jwtUtil.generateToken(user.getEmail());
		return ResponseEntity.ok(Map.of(
			"token", token,
			"email", user.getEmail(),
			"name", user.getName()
		));
	}

	@PutMapping("/password")
	public ResponseEntity<?> updatePassword(@RequestBody Map<String, String> data) {
		String email = data.get("email");
		String currentPassword = data.get("currentPassword");
		String newPassword = data.get("newPassword");
		User user = userRepository.findByEmail(email).orElse(null);
		if (user == null || !passwordEncoder.matches(currentPassword, user.getPassword())) {
			return ResponseEntity.status(401).body("현재 비밀번호가 일치하지 않습니다.");
		}
		user.setPassword(passwordEncoder.encode(newPassword));
		userRepository.save(user);
		return ResponseEntity.ok("비밀번호가 변경되었습니다!");
	}

	@DeleteMapping("/delete")
	public ResponseEntity<?> deleteUser(@RequestParam("email") String email) {
		if (!userAccountDeletionService.deleteAccountByEmail(email)) {
			return ResponseEntity.status(404).body("사용자를 찾을 수 없습니다.");
		}
		return ResponseEntity.ok("계정이 삭제되었습니다!");
	}

	@GetMapping("/info")
	public ResponseEntity<?> getUserInfo(@RequestParam("email") String email) {
		Optional<User> userOptional = userRepository.findByEmail(email);
		if (userOptional.isPresent()) {
			User user = userOptional.get();
			Map<String, Object> response = new HashMap<>();
			response.put("name", user.getName());
			response.put("email", user.getEmail());
			response.put("joinDate", user.getJoinDate());
			return ResponseEntity.ok(response);
		}
		return ResponseEntity.status(404).body("사용자를 찾을 수 없습니다.");
	}
}
